import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

// ── Calendar Events ───────────────────────────────────────────────────────────
router.get("/content/calendar", (req, res): void => {
  res.json({ events: req.session.contentCalendarEvents || [] });
});

router.post("/content/calendar", (req, res): void => {
  const { title, type, date, color, draftId, notes } = req.body;
  if (!title || !date) { res.status(400).json({ error: "Title and date required" }); return; }
  if (!req.session.contentCalendarEvents) req.session.contentCalendarEvents = [];
  const event = {
    id: randomUUID(), title, type: type || "post",
    date, color: color || "#000000", draftId: draftId || null,
    notes: notes || "", createdAt: Date.now(),
  };
  req.session.contentCalendarEvents.push(event);
  req.session.save(() => res.json({ event }));
});

router.patch("/content/calendar/:id", (req, res): void => {
  if (!req.session.contentCalendarEvents) { res.status(404).json({ error: "Not found" }); return; }
  req.session.contentCalendarEvents = req.session.contentCalendarEvents.map(e =>
    e.id === req.params.id ? { ...e, ...req.body, id: e.id } : e
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/content/calendar/:id", (req, res): void => {
  req.session.contentCalendarEvents = (req.session.contentCalendarEvents || []).filter(e => e.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Drafts ────────────────────────────────────────────────────────────────────
router.get("/content/drafts", (req, res): void => {
  const drafts = (req.session.contentDrafts || []).sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ drafts });
});

router.post("/content/drafts", (req, res): void => {
  const { title, type, content, thumbnailUrl, scheduledAt, tags } = req.body;
  if (!title) { res.status(400).json({ error: "Title required" }); return; }
  if (!req.session.contentDrafts) req.session.contentDrafts = [];
  const draft = {
    id: randomUUID(), title, type: type || "clothing",
    content: content || "", thumbnailUrl: thumbnailUrl || "",
    scheduledAt: scheduledAt || null, status: "draft" as const,
    tags: tags || [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  req.session.contentDrafts.push(draft);
  req.session.save(() => res.json({ draft }));
});

router.patch("/content/drafts/:id", (req, res): void => {
  if (!req.session.contentDrafts) { res.status(404).json({ error: "Not found" }); return; }
  req.session.contentDrafts = req.session.contentDrafts.map(d =>
    d.id === req.params.id ? { ...d, ...req.body, id: d.id, updatedAt: Date.now() } : d
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/content/drafts/:id", (req, res): void => {
  req.session.contentDrafts = (req.session.contentDrafts || []).filter(d => d.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── To-Do ─────────────────────────────────────────────────────────────────────
router.get("/content/todos", (req, res): void => {
  const todos = (req.session.contentTodos || []).sort((a, b) => {
    const PRIORITY = { high: 0, medium: 1, low: 2 };
    if (a.done !== b.done) return a.done ? 1 : -1;
    return PRIORITY[a.priority] - PRIORITY[b.priority];
  });
  res.json({ todos });
});

router.post("/content/todos", (req, res): void => {
  const { title, description, priority, category, dueDate } = req.body;
  if (!title) { res.status(400).json({ error: "Title required" }); return; }
  if (!req.session.contentTodos) req.session.contentTodos = [];
  const todo = {
    id: randomUUID(), title, description: description || "",
    priority: priority || "medium", category: category || "general",
    dueDate: dueDate || null, done: false, createdAt: Date.now(),
  };
  req.session.contentTodos.push(todo);
  req.session.save(() => res.json({ todo }));
});

router.patch("/content/todos/:id", (req, res): void => {
  if (!req.session.contentTodos) { res.status(404).json({ error: "Not found" }); return; }
  req.session.contentTodos = req.session.contentTodos.map(t =>
    t.id === req.params.id ? { ...t, ...req.body, id: t.id } : t
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/content/todos/:id", (req, res): void => {
  req.session.contentTodos = (req.session.contentTodos || []).filter(t => t.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

// ── Reminders ─────────────────────────────────────────────────────────────────
router.get("/content/reminders", (req, res): void => {
  const now = Date.now();
  const reminders = (req.session.contentReminders || []).sort((a, b) => a.dueAt - b.dueAt);
  // Auto-mark as notified if past notify window
  const updated = reminders.map(r => {
    if (!r.notified && r.dueAt - now <= r.notifyDaysBefore * 86400000) {
      return { ...r, notified: true };
    }
    return r;
  });
  if (updated.some((r, i) => r.notified !== reminders[i].notified)) {
    req.session.contentReminders = updated;
    req.session.save(() => {});
  }
  res.json({ reminders: updated });
});

router.post("/content/reminders", (req, res): void => {
  const { title, description, type, dueAt, notifyDaysBefore } = req.body;
  if (!title || !dueAt) { res.status(400).json({ error: "Title and dueAt required" }); return; }
  if (!req.session.contentReminders) req.session.contentReminders = [];
  const reminder = {
    id: randomUUID(), title, description: description || "",
    type: type || "general", dueAt: Number(dueAt),
    notifyDaysBefore: notifyDaysBefore || 1, notified: false, createdAt: Date.now(),
  };
  req.session.contentReminders.push(reminder);
  req.session.save(() => res.json({ reminder }));
});

router.patch("/content/reminders/:id", (req, res): void => {
  if (!req.session.contentReminders) { res.status(404).json({ error: "Not found" }); return; }
  req.session.contentReminders = req.session.contentReminders.map(r =>
    r.id === req.params.id ? { ...r, ...req.body, id: r.id } : r
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/content/reminders/:id", (req, res): void => {
  req.session.contentReminders = (req.session.contentReminders || []).filter(r => r.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

export default router;
