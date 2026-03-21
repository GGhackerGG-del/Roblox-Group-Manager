import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, licensesTable } from "@workspace/db";
import {
  VerifyLicenseBody,
  CheckLicenseStatusBody,
  CreateLicenseBody,
} from "@workspace/api-zod";
import { signToken, verifyToken, computeFingerprintHash } from "../lib/jwt.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  throw new Error("ADMIN_SECRET environment variable is required but was not provided.");
}

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

router.post("/license/verify", async (req, res): Promise<void> => {
  const parsed = VerifyLicenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { code, deviceFingerprint } = parsed.data;
  const fingerprintHash = computeFingerprintHash(deviceFingerprint);

  const [license] = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.code, code));

  if (!license) {
    res.status(401).json({ error: "Invalid activation code. Please check the code and try again." });
    return;
  }

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    res.status(401).json({ error: "License has expired." });
    return;
  }

  // Always update the fingerprint when the user explicitly provides their code.
  // This allows re-binding to the same or a new device (e.g. after clearing storage).
  // The license code itself is the credential; the fingerprint just encrypts the stored token.
  await db
    .update(licensesTable)
    .set({
      activated: true,
      activatedAt: license.activatedAt ?? new Date(),
      deviceFingerprint: fingerprintHash,
    })
    .where(eq(licensesTable.id, license.id));

  const expiresAt = license.expiresAt ? license.expiresAt.toISOString() : null;

  const token = signToken({
    licenseId: license.id,
    plan: license.plan,
    deviceFingerprintHash: fingerprintHash,
    expiresAt,
  });

  res.json({ token, plan: license.plan, expiresAt });
});

async function validateLicenseStatus(
  token: string,
  deviceFingerprint: string
): Promise<{ valid: true; plan: string; expiresAt: string | null } | { error: string; status: number }> {
  try {
    const payload = verifyToken(token);
    const fingerprintHash = computeFingerprintHash(deviceFingerprint);

    if (payload.deviceFingerprintHash !== fingerprintHash) {
      return { error: "Token is not valid for this device.", status: 401 };
    }

    const [license] = await db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, payload.licenseId));

    if (!license) {
      return { error: "License not found.", status: 401 };
    }

    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      return { error: "License has expired.", status: 401 };
    }

    if (license.deviceFingerprint !== fingerprintHash) {
      return { error: "Device does not match the registered one.", status: 403 };
    }

    return { valid: true, plan: payload.plan, expiresAt: payload.expiresAt };
  } catch {
    return { error: "Token is invalid or expired.", status: 401 };
  }
}

router.post("/license/status", async (req, res): Promise<void> => {
  const parsed = CheckLicenseStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await validateLicenseStatus(parsed.data.token, parsed.data.deviceFingerprint);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

router.get("/license/status", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization: Bearer <token> header required." });
    return;
  }

  const token = authHeader.slice(7);
  const deviceFingerprint = req.headers["x-device-fingerprint"];

  if (!deviceFingerprint || typeof deviceFingerprint !== "string") {
    res.status(400).json({ error: "X-Device-Fingerprint header required." });
    return;
  }

  const result = await validateLicenseStatus(token, deviceFingerprint);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

router.post("/license/admin/create", async (req, res): Promise<void> => {
  const parsed = CreateLicenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { plan, adminSecret } = parsed.data;

  if (adminSecret !== ADMIN_SECRET) {
    res.status(403).json({ error: "Unauthorized." });
    return;
  }

  if (!["week", "month", "lifetime"].includes(plan)) {
    res.status(400).json({ error: "Invalid plan. Must be week, month, or lifetime." });
    return;
  }

  const code = randomBytes(8).toString("hex").toUpperCase();

  let expiresAt: Date | null = null;
  if (plan === "week") expiresAt = addDays(7);
  else if (plan === "month") expiresAt = addDays(30);

  const [license] = await db
    .insert(licensesTable)
    .values({ code, plan, expiresAt, activated: false })
    .returning();

  res.status(201).json({
    id: license.id,
    code: license.code,
    plan: license.plan,
    expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
    activated: license.activated,
    createdAt: license.createdAt.toISOString(),
  });
});

export default router;
