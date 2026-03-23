import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

// ── Roblox avatar proxy ───────────────────────────────────────────────────────
router.get("/quality/roblox-avatar", async (req, res): Promise<void> => {
  const { username } = req.query as { username: string };
  if (!username) { res.status(400).json({ error: "username required" }); return; }
  try {
    // Step 1: resolve username → userId
    const userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });
    const userData = await userRes.json() as any;
    const user = userData.data?.[0];
    if (!user) { res.status(404).json({ error: "Пользователь не найден" }); return; }

    // Step 2: get thumbnail
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=420x420&format=Png&isCircular=false`);
    const thumbData = await thumbRes.json() as any;
    const imageUrl = thumbData.data?.[0]?.imageUrl;
    if (!imageUrl) { res.status(404).json({ error: "Аватар не найден" }); return; }

    res.json({ userId: user.id, displayName: user.displayName || user.name, imageUrl });
  } catch (e) {
    res.status(500).json({ error: "Ошибка запроса к Roblox API" });
  }
});

router.get("/quality/roblox-headshot/:userId", async (req, res): Promise<void> => {
  const userId = req.params.userId;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  try {
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
    const thumbData = await thumbRes.json() as any;
    const imageUrl = thumbData.data?.[0]?.imageUrl;
    if (!imageUrl) { res.status(404).json({ error: "Not found" }); return; }
    res.set("Cache-Control", "public, max-age=3600");
    res.redirect(imageUrl);
  } catch {
    res.status(500).json({ error: "Roblox API error" });
  }
});

// ── Quality Checklists ────────────────────────────────────────────────────────
const DEFAULT_ITEMS: Record<string, Array<{ text: string; required: boolean }>> = {
  shirt: [
    { text: "Файл в формате PNG с прозрачностью", required: true },
    { text: "Размер изображения 585×559 пикселей", required: true },
    { text: "Размер файла не превышает 2 МБ", required: true },
    { text: "Шаблон рубашки заполнен корректно (без артефактов)", required: true },
    { text: "Цвета соответствуют задумке дизайна", required: false },
    { text: "Логотип или текст не нарушает правила Roblox", required: true },
    { text: "Задняя часть рубашки прорисована", required: false },
    { text: "Рукава симметричны", required: false },
    { text: "Нет пикселей за пределами шаблона", required: true },
    { text: "Тестовый предпросмотр на аватаре выполнен", required: false },
  ],
  pants: [
    { text: "Файл в формате PNG с прозрачностью", required: true },
    { text: "Размер изображения 292×280 пикселей", required: true },
    { text: "Размер файла не превышает 2 МБ", required: true },
    { text: "Шаблон брюк заполнен корректно", required: true },
    { text: "Левая и правая стороны симметричны", required: false },
    { text: "Пояс прорисован", required: false },
    { text: "Нет нарушений правил модерации", required: true },
    { text: "Тестовый предпросмотр на аватаре выполнен", required: false },
  ],
  tshirt: [
    { text: "Файл в формате PNG с прозрачностью", required: true },
    { text: "Размер изображения 128×128 пикселей", required: true },
    { text: "Размер файла не превышает 2 МБ", required: true },
    { text: "Изображение чёткое при маленьком размере", required: false },
    { text: "Нет нарушений правил модерации", required: true },
    { text: "Фон прозрачный или соответствует дизайну", required: false },
  ],
  custom: [
    { text: "Файл в формате PNG", required: true },
    { text: "Размер файла не превышает 2 МБ", required: true },
    { text: "Нет нарушений правил Roblox", required: true },
  ],
};

router.get("/quality/checklists", (req, res): void => {
  res.json({ checklists: req.session.qualityChecklists || [] });
});

router.post("/quality/checklists", (req, res): void => {
  const { name, clothingType } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  if (!req.session.qualityChecklists) req.session.qualityChecklists = [];
  const items = (DEFAULT_ITEMS[clothingType] || DEFAULT_ITEMS.custom).map(it => ({ id: randomUUID(), text: it.text, done: false, required: it.required }));
  const cl = { id: randomUUID(), name, clothingType: clothingType || "custom", items, createdAt: Date.now(), lastUsed: null };
  req.session.qualityChecklists.push(cl);
  req.session.save(() => res.json({ checklist: cl }));
});

router.patch("/quality/checklists/:id", (req, res): void => {
  req.session.qualityChecklists = (req.session.qualityChecklists || []).map(c =>
    c.id === req.params.id ? { ...c, ...req.body, id: c.id, lastUsed: Date.now() } : c
  );
  req.session.save(() => res.json({ ok: true }));
});

router.delete("/quality/checklists/:id", (req, res): void => {
  req.session.qualityChecklists = (req.session.qualityChecklists || []).filter(c => c.id !== req.params.id);
  req.session.save(() => res.json({ ok: true }));
});

export default router;
