import { Router } from "express";

const router = Router();

const TODAY = () => new Date().toISOString().slice(0, 10);
const YESTERDAY = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// All achievement definitions
const ACHIEVEMENTS = [
  // Platform
  { id: "early_adopter", title: "Early Adopter", desc: "Первый вход в платформу", icon: "🚀", category: "platform", xp: 50 },
  { id: "explorer", title: "Исследователь", desc: "Посетил 5+ разделов платформы", icon: "🗺️", category: "platform", xp: 100 },
  { id: "power_user", title: "Power User", desc: "Посетил все разделы платформы", icon: "⚡", category: "platform", xp: 200 },
  // Streaks
  { id: "streak_3", title: "On Fire", desc: "3-дневный стрик входов", icon: "🔥", category: "streak", xp: 75 },
  { id: "streak_7", title: "Unstoppable", desc: "7-дневный стрик входов", icon: "💪", category: "streak", xp: 150 },
  { id: "streak_30", title: "Dedicated", desc: "30-дневный стрик входов", icon: "🌟", category: "streak", xp: 500 },
  { id: "logins_10", title: "Постоянный", desc: "10 входов за всё время", icon: "🔑", category: "streak", xp: 100 },
  { id: "logins_50", title: "Преданный", desc: "50 входов за всё время", icon: "💎", category: "streak", xp: 300 },
  // Finance
  { id: "first_invoice", title: "Первый счёт", desc: "Создал первый счёт", icon: "🧾", category: "finance", xp: 75 },
  { id: "paid_invoice", title: "Первая оплата", desc: "Получил первый оплаченный счёт", icon: "💰", category: "finance", xp: 150 },
  { id: "invoices_10", title: "Бухгалтер", desc: "Создал 10+ счетов", icon: "📊", category: "finance", xp: 200 },
  { id: "first_goal", title: "Целеустремлённый", desc: "Создал финансовую цель", icon: "🎯", category: "finance", xp: 75 },
  { id: "goal_complete", title: "Финансист", desc: "Достиг финансовой цели", icon: "🏆", category: "finance", xp: 250 },
  // Content
  { id: "first_draft", title: "Первый черновик", desc: "Создал первый черновик", icon: "✏️", category: "content", xp: 50 },
  { id: "drafts_10", title: "Контент-мейкер", desc: "Создал 10+ черновиков", icon: "🎬", category: "content", xp: 150 },
  { id: "calendar_5", title: "Планировщик", desc: "Добавил 5+ событий в календарь", icon: "📅", category: "content", xp: 100 },
  { id: "todos_10", title: "Task Master", desc: "Выполнил 10+ задач", icon: "✅", category: "content", xp: 150 },
  { id: "reminder_set", title: "Пунктуальный", desc: "Создал напоминание о дедлайне", icon: "🔔", category: "content", xp: 50 },
  // Social
  { id: "social_connected", title: "Connected", desc: "Добавил аккаунт соцсети", icon: "🌐", category: "social", xp: 75 },
  { id: "autopost_on", title: "Автоматор", desc: "Включил авто-публикацию в Discord", icon: "🤖", category: "social", xp: 100 },
  { id: "links_hub", title: "Link Master", desc: "Добавил 3+ ссылки в Link Hub", icon: "🔗", category: "social", xp: 100 },
];

const MILESTONES = [
  { id: "m_invoices_1", title: "Первый счёт", desc: "Создай свой первый счёт", icon: "🧾", reward: "50 XP", target: 1, metric: "invoices", xp: 50 },
  { id: "m_invoices_5", title: "5 счетов", desc: "Создай 5 счетов", icon: "📋", reward: "100 XP", target: 5, metric: "invoices", xp: 100 },
  { id: "m_drafts_1", title: "Первый черновик", desc: "Создай свой первый черновик", icon: "✏️", reward: "50 XP", target: 1, metric: "drafts", xp: 50 },
  { id: "m_drafts_5", title: "5 черновиков", desc: "Создай 5 черновиков", icon: "📝", reward: "100 XP", target: 5, metric: "drafts", xp: 100 },
  { id: "m_todos_5", title: "5 задач", desc: "Выполни 5 задач", icon: "✅", reward: "75 XP", target: 5, metric: "todos_done", xp: 75 },
  { id: "m_todos_20", title: "20 задач", desc: "Выполни 20 задач", icon: "🏅", reward: "200 XP", target: 20, metric: "todos_done", xp: 200 },
  { id: "m_streak_3", title: "Стрик 3 дня", desc: "Войди 3 дня подряд", icon: "🔥", reward: "75 XP", target: 3, metric: "streak", xp: 75 },
  { id: "m_streak_7", title: "Стрик 7 дней", desc: "Войди 7 дней подряд", icon: "💪", reward: "150 XP", target: 7, metric: "streak", xp: 150 },
  { id: "m_calendar_3", title: "3 события", desc: "Добавь 3 события в календарь", icon: "📅", reward: "75 XP", target: 3, metric: "calendar", xp: 75 },
  { id: "m_goals_1", title: "Первая цель", desc: "Создай финансовую цель", icon: "🎯", reward: "50 XP", target: 1, metric: "goals", xp: 50 },
];

function getMetrics(session: any) {
  const streak = session.streakData?.currentStreak || 0;
  const totalLogins = session.streakData?.totalLogins || 0;
  const invoices = (session.invoices || []).length;
  const paidInvoices = (session.invoices || []).filter((i: any) => i.status === "paid").length;
  const drafts = (session.contentDrafts || []).length;
  const todosDone = (session.contentTodos || []).filter((t: any) => t.done).length;
  const calendar = (session.contentCalendarEvents || []).length;
  const goals = (session.financialGoals || []).length;
  const completedGoals = (session.financialGoals || []).filter((g: any) => g.currentAmount >= g.targetAmount).length;
  const socialAccounts = (session.socialAccounts || []).length;
  const autoPostOn = session.autoPostConfig?.enabled || false;
  const links = (session.socialLinks || []).length;
  const visited = (session.visitedSections || []).length;
  return { streak, totalLogins, invoices, paidInvoices, drafts, todosDone, calendar, goals, completedGoals, socialAccounts, autoPostOn, links, visited };
}

function computeUnlocked(session: any): string[] {
  const m = getMetrics(session);
  const unlocked: string[] = [];
  // Platform
  unlocked.push("early_adopter"); // Always unlocked (they're logged in)
  if (m.visited >= 5) unlocked.push("explorer");
  if (m.visited >= 12) unlocked.push("power_user");
  // Streaks
  if (m.streak >= 3) unlocked.push("streak_3");
  if (m.streak >= 7) unlocked.push("streak_7");
  if (m.streak >= 30) unlocked.push("streak_30");
  if (m.totalLogins >= 10) unlocked.push("logins_10");
  if (m.totalLogins >= 50) unlocked.push("logins_50");
  // Finance
  if (m.invoices >= 1) unlocked.push("first_invoice");
  if (m.paidInvoices >= 1) unlocked.push("paid_invoice");
  if (m.invoices >= 10) unlocked.push("invoices_10");
  if (m.goals >= 1) unlocked.push("first_goal");
  if (m.completedGoals >= 1) unlocked.push("goal_complete");
  // Content
  if (m.drafts >= 1) unlocked.push("first_draft");
  if (m.drafts >= 10) unlocked.push("drafts_10");
  if (m.calendar >= 5) unlocked.push("calendar_5");
  if (m.todosDone >= 10) unlocked.push("todos_10");
  if ((session.contentReminders || []).length >= 1) unlocked.push("reminder_set");
  // Social
  if (m.socialAccounts >= 1) unlocked.push("social_connected");
  if (m.autoPostOn) unlocked.push("autopost_on");
  if (m.links >= 3) unlocked.push("links_hub");
  return unlocked;
}

function getMilestoneProgress(session: any) {
  const m = getMetrics(session);
  const claimed = session.claimedMilestones || [];
  return MILESTONES.map(ms => {
    let current = 0;
    if (ms.metric === "invoices") current = m.invoices;
    else if (ms.metric === "drafts") current = m.drafts;
    else if (ms.metric === "todos_done") current = m.todosDone;
    else if (ms.metric === "streak") current = m.streak;
    else if (ms.metric === "calendar") current = m.calendar;
    else if (ms.metric === "goals") current = m.goals;
    const reached = current >= ms.target;
    const isClaimed = claimed.includes(ms.id);
    return { ...ms, current: Math.min(current, ms.target), reached, claimed: isClaimed };
  });
}

function computeXP(unlocked: string[], claimed: string[]) {
  const achievementXP = ACHIEVEMENTS.filter(a => unlocked.includes(a.id)).reduce((s, a) => s + a.xp, 0);
  const milestoneXP = MILESTONES.filter(m => claimed.includes(m.id)).reduce((s, m) => s + m.xp, 0);
  return achievementXP + milestoneXP;
}

function xpToLevel(xp: number) {
  const thresholds = [0, 100, 250, 500, 900, 1400, 2000, 2750, 3750, 5000, 7000];
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
  }
  const nextXP = thresholds[Math.min(level, thresholds.length - 1)] || thresholds[thresholds.length - 1];
  const prevXP = thresholds[level - 1] || 0;
  return { level, nextXP, prevXP, progress: nextXP > prevXP ? (xp - prevXP) / (nextXP - prevXP) : 1 };
}

const LEADERBOARD_SEEDS = [
  { username: "RbxKing_Pro", avatar: "👑", days: 45, xp: 3200, streak: 12, invoices: 28, drafts: 45 },
  { username: "ClothingBoss", avatar: "👔", days: 30, xp: 2100, streak: 8, invoices: 15, drafts: 31 },
  { username: "LimitedHunter", avatar: "💎", days: 60, xp: 4800, streak: 21, invoices: 42, drafts: 67 },
  { username: "GroupOwner88", avatar: "🏆", days: 20, xp: 1300, streak: 5, invoices: 9, drafts: 18 },
  { username: "RbxDesigner", avatar: "🎨", days: 90, xp: 6200, streak: 30, invoices: 55, drafts: 89 },
  { username: "FashionMogul", avatar: "👗", days: 15, xp: 850, streak: 3, invoices: 6, drafts: 12 },
  { username: "LimitedFlip", avatar: "📈", days: 35, xp: 2600, streak: 15, invoices: 20, drafts: 37 },
];

// ── Routes ────────────────────────────────────────────────────────────────────

// Track section visits
router.post("/gamification/visit", (req, res): void => {
  const { section } = req.body;
  if (!section) { res.status(400).json({ error: "Section required" }); return; }
  if (!req.session.visitedSections) req.session.visitedSections = [];
  if (!req.session.visitedSections.includes(section)) {
    req.session.visitedSections.push(section);
  }
  req.session.save(() => res.json({ ok: true, visited: req.session.visitedSections }));
});

// Main gamification data
router.get("/gamification/dashboard", (req, res): void => {
  const today = TODAY();
  const yesterday = YESTERDAY();

  // Update streak
  if (!req.session.streakData) {
    req.session.streakData = {
      currentStreak: 1, longestStreak: 1, lastLoginDate: today,
      totalLogins: 1, streakStartDate: today,
    };
    req.session.save(() => {});
  } else if (req.session.streakData.lastLoginDate !== today) {
    const sd = req.session.streakData;
    if (sd.lastLoginDate === yesterday) {
      sd.currentStreak += 1;
      sd.longestStreak = Math.max(sd.longestStreak, sd.currentStreak);
    } else {
      sd.currentStreak = 1;
      sd.streakStartDate = today;
    }
    sd.lastLoginDate = today;
    sd.totalLogins += 1;
    req.session.save(() => {});
  }

  const unlocked = computeUnlocked(req.session);
  const claimed = req.session.claimedMilestones || [];
  const xp = computeXP(unlocked, claimed);
  const levelInfo = xpToLevel(xp);
  const metrics = getMetrics(req.session);

  // New achievements since last check
  const prevUnlocked = req.session.unlockedAchievements || [];
  const newlyUnlocked = unlocked.filter(id => !prevUnlocked.includes(id));
  req.session.unlockedAchievements = unlocked;
  req.session.save(() => {});

  // Build leaderboard — insert current user based on XP
  const userEntry = {
    username: "Вы",
    avatar: "⭐",
    xp,
    streak: req.session.streakData?.currentStreak || 1,
    invoices: metrics.invoices,
    drafts: metrics.drafts,
    isMe: true,
  };
  const board = [
    ...LEADERBOARD_SEEDS.map(s => ({ ...s, isMe: false })),
    userEntry,
  ].sort((a, b) => b.xp - a.xp).map((e, i) => ({ ...e, rank: i + 1 }));

  res.json({
    streak: req.session.streakData,
    xp,
    level: levelInfo,
    achievements: ACHIEVEMENTS.map(a => ({ ...a, unlocked: unlocked.includes(a.id) })),
    milestones: getMilestoneProgress(req.session),
    leaderboard: board,
    newlyUnlocked,
    metrics,
  });
});

// Claim a milestone reward
router.post("/gamification/milestones/:id/claim", (req, res): void => {
  if (!req.session.claimedMilestones) req.session.claimedMilestones = [];
  const ms = MILESTONES.find(m => m.id === req.params.id);
  if (!ms) { res.status(404).json({ error: "Not found" }); return; }
  const milestones = getMilestoneProgress(req.session);
  const milestone = milestones.find(m => m.id === req.params.id);
  if (!milestone?.reached) { res.status(400).json({ error: "Not yet reached" }); return; }
  if (!req.session.claimedMilestones.includes(req.params.id)) {
    req.session.claimedMilestones.push(req.params.id);
    req.session.save(() => {});
  }
  res.json({ ok: true, xpGained: ms.xp });
});

export default router;
