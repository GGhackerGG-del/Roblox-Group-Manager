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
    robloxOpenCloudApiKey?: string;
    sessionCreatedAt?: number;
    activityLog?: Array<{
      id: string;
      action: string;
      detail?: string;
      ts: number;
      userId?: number;
    }>;
    proxyConfig?: {
      url: string;
      enabled: boolean;
      addedAt: number;
    };
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
