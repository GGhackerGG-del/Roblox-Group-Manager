import jwt from "jsonwebtoken";
import { createHmac } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required but was not provided.");
}

export interface TokenPayload {
  licenseId: number;
  plan: string;
  deviceFingerprintHash: string;
  expiresAt: string | null;
}

/**
 * Compute a server-side HMAC of the raw device fingerprint using JWT_SECRET.
 * Stored in JWT payload and DB — never the raw fingerprint, so decoding the JWT
 * cannot reveal a value that can be replayed in the X-Device-Fingerprint header.
 */
export function computeFingerprintHash(rawFingerprint: string): string {
  return createHmac("sha256", JWT_SECRET!).update(rawFingerprint).digest("hex");
}

export function signToken(payload: TokenPayload): string {
  const options: jwt.SignOptions = {};
  if (payload.expiresAt) {
    options.expiresIn = Math.max(1, Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000));
  }
  return jwt.sign(payload, JWT_SECRET!, options);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET!) as TokenPayload;
}
