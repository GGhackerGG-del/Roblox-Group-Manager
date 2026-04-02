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
      avatarUrl?: string;
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
    qualityChecklists?: Array<{ id: string; name: string; clothingType: string; items: Array<{ id: string; text: string; done: boolean; required: boolean }>; createdAt: number; lastUsed: number | null }>;
    teamStaff?: Array<{ id: string; username: string; robloxId: string; displayName: string; avatarUrl: string; role: string; department: string; status: "active" | "inactive" | "suspended"; joinedAt: number; notes: string; salary: number }>;
    teamRoles?: Array<{ id: string; name: string; color: string; level: number; permissions: string[] }>;
    teamPerformance?: Array<{ id: string; staffId: string; date: number; tasksCompleted: number; rating: number; note: string; category: string }>;
    teamMessages?: Array<{ id: string; authorId: string; authorName: string; text: string; sentAt: number; edited: boolean; reactions: Record<string, number> }>;
    teamShifts?: Array<{ id: string; title: string; date: string; startTime: string; endTime: string; department: string; requiredStaff: number; assignedStaff: string[]; status: "scheduled" | "in-progress" | "completed" | "cancelled"; notes: string; clockIns: Array<{ staffId: string; clockedIn: number; clockedOut: number | null }> }>;
    pnlReportSchedules?: Array<{
      id: string;
      groupId: number;
      groupName: string;
      intervalHours: number;
      discordWebhookUrl: string;
      telegramChatId: string;
      enabled: boolean;
      lastSentAt: number | null;
      createdAt: number;
    }>;
    integrationDiscord?: { notifyEvents: string[]; testChannelWebhookId: string };
    integrationTelegram?: { notifyEvents: string[]; chatIds: string[]; messageLog: Array<{ chatId: string; text: string; sentAt: number; ok: boolean }> };
    integrationEmail?: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; fromEmail: string; toEmail: string; notifyEvents: string[]; enabled: boolean };
    integrationSheets?: { sheetId: string; sheetUrl: string; syncFields: string[]; lastSync: number | null; autoSync: boolean };
    customWebhooks?: Array<{ id: string; name: string; url: string; method: string; headers: string; payload: string; events: string[]; enabled: boolean; createdAt: number; lastTriggered: number | null; lastStatus: number | null }>;
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
