import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, licensesTable } from "@workspace/db";
import { verifyToken, computeFingerprintHash } from "../lib/jwt.js";

export async function requireLicense(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "License token required." });
    return;
  }

  const rawFingerprint = req.headers["x-device-fingerprint"];
  if (!rawFingerprint || typeof rawFingerprint !== "string") {
    res.status(401).json({ error: "Device identifier required." });
    return;
  }

  const token = authHeader.slice(7);

  let payload: ReturnType<typeof verifyToken>;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Invalid license token." });
    return;
  }

  if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
    res.status(401).json({ error: "License has expired." });
    return;
  }

  const fingerprintHash = computeFingerprintHash(rawFingerprint);

  if (payload.deviceFingerprintHash !== fingerprintHash) {
    res.status(403).json({ error: "Token is bound to another device." });
    return;
  }

  const [license] = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.id, payload.licenseId));

  if (!license) {
    res.status(401).json({ error: "License not found or revoked." });
    return;
  }

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    res.status(401).json({ error: "License has expired." });
    return;
  }

  if (license.deviceFingerprint !== fingerprintHash) {
    res.status(403).json({ error: "Token is bound to another device." });
    return;
  }

  req.licensePayload = payload;
  next();
}
