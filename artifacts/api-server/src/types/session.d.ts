import "express-session";

declare module "express-session" {
  interface SessionData {
    robloxCookie?: string;
    robloxUserId?: number;
    robloxProfile?: {
      id: number;
      name: string;
      displayName: string;
      description: string;
      avatarUrl: string | null;
    };
    altAccounts?: Array<{
      cookie: string;
      userId: number;
      name: string;
      displayName: string;
      avatarUrl: string | null;
    }>;
  }
}

declare module "express" {
  interface Request {
    licensePayload?: {
      licenseId: number;
      plan: string;
      deviceFingerprintHash: string;
      expiresAt: string | null;
    };
  }
}
