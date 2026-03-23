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
    webhooks?: Array<{
      id: string;
      name: string;
      url: string;
      type: "discord" | "telegram";
      events: string[];
      enabled: boolean;
      addedAt: number;
      lastTriggered?: number;
    }>;
    promotions?: Array<{
      id: string;
      title: string;
      description: string;
      discountPercent: number;
      startsAt: number;
      endsAt: number;
      itemType: string;
      webhookNotify: boolean;
      status: "scheduled" | "active" | "ended";
    }>;
    autoPostConfig?: {
      enabled: boolean;
      webhookId: string;
      groupId: string;
      template: string;
      color: number;
      lastPostedItemId: number | null;
      lastChecked: number | null;
    };
    autoPostHistory?: Array<{
      id: string;
      itemId: number;
      itemName: string;
      thumbnailUrl: string | null;
      webhookName: string;
      postedAt: number;
      success: boolean;
    }>;
    socialLinks?: Array<{
      id: string;
      title: string;
      url: string;
      icon: string;
      description: string;
      color: string;
      order: number;
      addedAt: number;
    }>;
    socialAccounts?: Array<{
      id: string;
      platform: string;
      handle: string;
      url: string;
      followers: number | null;
    }>;
    invoices?: Array<{
      id: string;
      number: string;
      clientName: string;
      clientEmail: string;
      currency: "robux" | "usd" | "rub";
      items: Array<{ description: string; qty: number; price: number }>;
      notes: string;
      status: "draft" | "sent" | "paid" | "overdue";
      createdAt: number;
      dueDate: number | null;
    }>;
    financialGoals?: Array<{
      id: string;
      title: string;
      category: string;
      targetAmount: number;
      currentAmount: number;
      currency: string;
      deadline: number | null;
      createdAt: number;
    }>;
    contentDrafts?: Array<{
      id: string;
      title: string;
      type: string;
      content: string;
      thumbnailUrl: string;
      scheduledAt: number | null;
      status: "draft" | "ready" | "scheduled" | "published";
      tags: string[];
      createdAt: number;
      updatedAt: number;
    }>;
    contentTodos?: Array<{
      id: string;
      title: string;
      description: string;
      priority: "low" | "medium" | "high";
      category: string;
      dueDate: number | null;
      done: boolean;
      createdAt: number;
    }>;
    contentReminders?: Array<{
      id: string;
      title: string;
      description: string;
      type: string;
      dueAt: number;
      notifyDaysBefore: number;
      notified: boolean;
      createdAt: number;
    }>;
    contentCalendarEvents?: Array<{
      id: string;
      title: string;
      type: string;
      date: string;
      color: string;
      draftId: string | null;
      notes: string;
      createdAt: number;
    }>;
    streakData?: {
      currentStreak: number;
      longestStreak: number;
      lastLoginDate: string;
      totalLogins: number;
      streakStartDate: string;
    };
    unlockedAchievements?: string[];
    visitedSections?: string[];
    claimedMilestones?: string[];
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
