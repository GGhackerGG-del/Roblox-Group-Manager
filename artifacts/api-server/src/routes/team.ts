import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

const DEFAULT_ROLES = [
  { id: "owner", name: "Владелец", color: "#FFD700", level: 100, permissions: ["all"] },
  { id: "admin", name: "Администратор", color: "#FF4444", level: 90, permissions: ["manage_staff", "manage_roles", "view_finance", "manage_clothing", "manage_content", "manage_marketing", "view_analytics"] },
  { id: "moderator", name: "Модератор", color: "#FF8800", level: 60, permissions: ["manage_content", "view_analytics", "manage_community"] },
  { id: "designer", name: "Дизайнер", color: "#AA44FF", level: 40, permissions: ["manage_clothing", "manage_content"] },
  { id: "developer", name: "Разработчик", color: "#0088FF", level: 50, permissions: ["manage_games", "view_analytics"] },
  { id: "manager", name: "Менеджер", color: "#00CC66", level: 30, permissions: ["manage_marketing", "view_analytics", "manage_community"] },
];

const ALL_PERMISSIONS = [
  { key: "all", label: "Полный доступ" },
  { key: "manage_staff", label: "Управление персоналом" },
  { key: "manage_roles", label: "Управление ролями" },
  { key: "view_finance", label: "Просмотр финансов" },
  { key: "manage_clothing", label: "Управление одеждой" },
  { key: "manage_content", label: "Управление контентом" },
  { key: "manage_marketing", label: "Маркетинг" },
  { key: "view_analytics", label: "Аналитика" },
  { key: "manage_community", label: "Сообщество" },
  { key: "manage_games", label: "Игры" },
  { key: "manage_integrations", label: "Интеграции" },
  { key: "manage_security", label: "Безопасность" },
];

function ensureRoles(req: any) {
  if (!req.session.teamRoles || req.session.teamRoles.length === 0) {
    req.session.teamRoles = DEFAULT_ROLES;
  }
}

// ── Staff Manager ─────────────────────────────────────────────────────────────
router.get("/team/staff", (req, res): void => {
  ensureRoles(req);
  res.json({
    staff: req.session.teamStaff || [],
    roles: req.session.teamRoles,
    departments: ["Менеджмент", "Дизайн", "Разработка", "Маркетинг", "Модерация", "Поддержка"],
  });
});

router.post("/team/staff", (req, res): void => {
  const { username, robloxId, displayName, avatarUrl, role, department, salary, notes } = req.body;
  if (!username) { res.status(400).json({ error: "username required" }); return; }
  if (!req.session.teamStaff) req.session.teamStaff = [];
  const member = { id: randomUUID(), username, robloxId: robloxId || "", displayName: displayName || username, avatarUrl: avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId || "1"}&width=150&height=150&format=png`, role: role || "moderator", department: department || "Менеджмент", status: "active" as const, joinedAt: Date.now(), notes: notes || "", salary: salary || 0 };
  req.session.teamStaff.push(member);
  req.session.save(() => res.json({ member }));
});

router.patch("/team/staff/:id", (req, res): void => {
  req.session.teamStaff = (req.session.teamStaff || []).map(m => m.id === req.params.id ? { ...m, ...req.body, id: m.id } : m);
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/team/staff/:id", (req, res): void => {
  req.session.teamStaff = (req.session.teamStaff || []).filter(m => m.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Role Permissions ──────────────────────────────────────────────────────────
router.get("/team/roles", (req, res): void => {
  ensureRoles(req);
  res.json({ roles: req.session.teamRoles, allPermissions: ALL_PERMISSIONS });
});

router.post("/team/roles", (req, res): void => {
  ensureRoles(req);
  const { name, color, level, permissions } = req.body;
  const role = { id: randomUUID(), name, color: color || "#888888", level: level || 10, permissions: permissions || [] };
  req.session.teamRoles!.push(role);
  req.session.save(() => res.json({ role }));
});

router.patch("/team/roles/:id", (req, res): void => {
  req.session.teamRoles = (req.session.teamRoles || []).map(r => r.id === req.params.id ? { ...r, ...req.body, id: r.id } : r);
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/team/roles/:id", (req, res): void => {
  req.session.teamRoles = (req.session.teamRoles || []).filter(r => r.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Performance ───────────────────────────────────────────────────────────────
router.get("/team/performance", (req, res): void => {
  res.json({
    records: req.session.teamPerformance || [],
    staff: (req.session.teamStaff || []).filter(m => m.status === "active"),
  });
});

router.post("/team/performance", (req, res): void => {
  const { staffId, tasksCompleted, rating, note, category } = req.body;
  if (!staffId) { res.status(400).json({ error: "staffId required" }); return; }
  if (!req.session.teamPerformance) req.session.teamPerformance = [];
  const record = { id: randomUUID(), staffId, date: Date.now(), tasksCompleted: tasksCompleted || 0, rating: rating || 5, note: note || "", category: category || "general" };
  req.session.teamPerformance.push(record);
  req.session.save(() => res.json({ record }));
});

router.delete("/team/performance/:id", (req, res): void => {
  req.session.teamPerformance = (req.session.teamPerformance || []).filter(r => r.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Internal Chat ─────────────────────────────────────────────────────────────
router.get("/team/chat", (req, res): void => {
  res.json({ messages: (req.session.teamMessages || []).slice(-100) });
});

router.post("/team/chat", (req, res): void => {
  const { authorId, authorName, text } = req.body;
  if (!text?.trim()) { res.status(400).json({ error: "text required" }); return; }
  if (!req.session.teamMessages) req.session.teamMessages = [];
  const msg = { id: randomUUID(), authorId: authorId || "owner", authorName: authorName || "Владелец", text: text.trim(), sentAt: Date.now(), edited: false, reactions: {} };
  req.session.teamMessages.push(msg);
  req.session.save(() => res.json({ message: msg }));
});

router.post("/team/chat/:id/react", (req, res): void => {
  const { emoji } = req.body;
  req.session.teamMessages = (req.session.teamMessages || []).map(m => {
    if (m.id !== req.params.id) return m;
    const reactions = { ...m.reactions };
    reactions[emoji] = (reactions[emoji] || 0) + 1;
    return { ...m, reactions };
  });
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/team/chat/:id", (req, res): void => {
  req.session.teamMessages = (req.session.teamMessages || []).filter(m => m.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Shift System ──────────────────────────────────────────────────────────────
router.get("/team/shifts", (req, res): void => {
  res.json({
    shifts: req.session.teamShifts || [],
    staff: (req.session.teamStaff || []).filter(m => m.status === "active"),
    departments: ["Менеджмент", "Дизайн", "Разработка", "Маркетинг", "Модерация", "Поддержка"],
  });
});

router.post("/team/shifts", (req, res): void => {
  const { title, date, startTime, endTime, department, requiredStaff, assignedStaff, notes } = req.body;
  if (!title || !date) { res.status(400).json({ error: "title and date required" }); return; }
  if (!req.session.teamShifts) req.session.teamShifts = [];
  const shift = { id: randomUUID(), title, date, startTime: startTime || "09:00", endTime: endTime || "18:00", department: department || "Менеджмент", requiredStaff: requiredStaff || 1, assignedStaff: assignedStaff || [], status: "scheduled" as const, notes: notes || "", clockIns: [] };
  req.session.teamShifts.push(shift);
  req.session.save(() => res.json({ shift }));
});

router.patch("/team/shifts/:id", (req, res): void => {
  req.session.teamShifts = (req.session.teamShifts || []).map(s => s.id === req.params.id ? { ...s, ...req.body, id: s.id } : s);
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/team/shifts/:id", (req, res): void => {
  req.session.teamShifts = (req.session.teamShifts || []).filter(s => s.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

router.post("/team/shifts/:id/clockin", (req, res): void => {
  const { staffId } = req.body;
  req.session.teamShifts = (req.session.teamShifts || []).map(s => {
    if (s.id !== req.params.id) return s;
    const existing = s.clockIns.find(c => c.staffId === staffId && !c.clockedOut);
    if (existing) return s;
    return { ...s, status: "in-progress" as const, clockIns: [...s.clockIns, { staffId, clockedIn: Date.now(), clockedOut: null }] };
  });
  req.session.save(() => res.json({ ok: true }));
});

router.post("/team/shifts/:id/clockout", (req, res): void => {
  const { staffId } = req.body;
  req.session.teamShifts = (req.session.teamShifts || []).map(s => {
    if (s.id !== req.params.id) return s;
    const clockIns = s.clockIns.map(c => c.staffId === staffId && !c.clockedOut ? { ...c, clockedOut: Date.now() } : c);
    const allOut = clockIns.every(c => c.clockedOut !== null);
    return { ...s, clockIns, status: allOut ? "completed" as const : s.status };
  });
  req.session.save(() => res.json({ ok: true }));
});

export default router;
