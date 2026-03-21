import TelegramBot from "node-telegram-bot-api";
import { randomBytes } from "crypto";
import { db, licensesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = 7506471937;

if (!TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required.");
}

const bot = new TelegramBot(TOKEN, { polling: true });

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function isAdmin(userId: number): boolean {
  return userId === ADMIN_ID;
}

function planLabel(plan: string): string {
  if (plan === "week") return "7 дней (499₽)";
  if (plan === "month") return "30 дней (1499₽)";
  if (plan === "lifetime") return "Навсегда (2999₽)";
  return plan;
}

function formatDate(date: Date | null): string {
  if (!date) return "Бессрочно";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function createLicense(plan: "week" | "month" | "lifetime"): Promise<string> {
  const code = randomBytes(8).toString("hex").toUpperCase();
  let expiresAt: Date | null = null;
  if (plan === "week") expiresAt = addDays(7);
  else if (plan === "month") expiresAt = addDays(30);

  await db.insert(licensesTable).values({ code, plan, expiresAt, activated: false });
  return code;
}

const adminKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "➕ Выдать подписку" }],
      [{ text: "📋 Список лицензий" }, { text: "🔍 Проверить код" }],
    ],
    resize_keyboard: true,
  },
};

const planKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "7 дней — 499₽", callback_data: "plan_week" }],
      [{ text: "30 дней — 1499₽", callback_data: "plan_month" }],
      [{ text: "Навсегда — 2999₽", callback_data: "plan_lifetime" }],
    ],
  },
};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;

  if (!userId || !isAdmin(userId)) {
    await bot.sendMessage(chatId,
      "👋 Добро пожаловать в *Limited.Ink*!\n\n" +
      "Здесь вы можете управлять лицензиями для сервиса управления Roblox-группами.\n\n" +
      "Если у вас уже есть код активации — введите его на сайте.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  await bot.sendMessage(chatId,
    "👑 *Панель администратора Limited.Ink*\n\n" +
    "Выберите действие:",
    { parse_mode: "Markdown", ...adminKeyboard }
  );
});

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;

  if (!userId || !isAdmin(userId)) {
    await bot.sendMessage(chatId, "⛔ Доступ запрещён.");
    return;
  }

  await bot.sendMessage(chatId,
    "👑 *Панель администратора Limited.Ink*\n\nВыберите действие:",
    { parse_mode: "Markdown", ...adminKeyboard }
  );
});

const pendingCheck: Set<number> = new Set();

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = msg.text;

  if (!text || !userId) return;
  if (text.startsWith("/")) return;

  if (!isAdmin(userId)) return;

  if (text === "➕ Выдать подписку") {
    await bot.sendMessage(chatId, "Выберите план подписки:", planKeyboard);
    return;
  }

  if (text === "📋 Список лицензий") {
    const licenses = await db
      .select()
      .from(licensesTable)
      .orderBy(licensesTable.createdAt)
      .limit(20);

    if (licenses.length === 0) {
      await bot.sendMessage(chatId, "Лицензий ещё нет.");
      return;
    }

    const lines = licenses.map((l, i) => {
      const status = l.activated ? "✅ Активирована" : "⏳ Не активирована";
      const exp = formatDate(l.expiresAt);
      return `${i + 1}. \`${l.code}\` — ${planLabel(l.plan)}\n   ${status} | До: ${exp}`;
    });

    const total = licenses.length;
    const activated = licenses.filter((l) => l.activated).length;

    await bot.sendMessage(chatId,
      `📋 *Лицензии (последние 20):*\n\n${lines.join("\n\n")}\n\n` +
      `Активировано: ${activated}/${total}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "🔍 Проверить код") {
    pendingCheck.add(userId);
    await bot.sendMessage(chatId, "Введите код лицензии для проверки:");
    return;
  }

  if (pendingCheck.has(userId)) {
    pendingCheck.delete(userId);
    const code = text.trim().toUpperCase();
    const [license] = await db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.code, code));

    if (!license) {
      await bot.sendMessage(chatId, `❌ Код \`${code}\` не найден.`, { parse_mode: "Markdown" });
      return;
    }

    const status = license.activated ? "✅ Активирована" : "⏳ Не активирована";
    const exp = formatDate(license.expiresAt);
    const activatedAt = license.activatedAt
      ? formatDate(license.activatedAt)
      : "Ещё не активирована";

    await bot.sendMessage(chatId,
      `🔍 *Информация о лицензии*\n\n` +
      `Код: \`${license.code}\`\n` +
      `План: ${planLabel(license.plan)}\n` +
      `Статус: ${status}\n` +
      `Истекает: ${exp}\n` +
      `Активирована: ${activatedAt}`,
      { parse_mode: "Markdown" }
    );
    return;
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!chatId || !data) return;

  await bot.answerCallbackQuery(query.id);

  if (!isAdmin(userId)) {
    await bot.sendMessage(chatId, "⛔ Доступ запрещён.");
    return;
  }

  const planMap: Record<string, "week" | "month" | "lifetime"> = {
    plan_week: "week",
    plan_month: "month",
    plan_lifetime: "lifetime",
  };

  const plan = planMap[data];
  if (!plan) return;

  try {
    const code = await createLicense(plan);
    await bot.sendMessage(chatId,
      `✅ *Лицензия создана!*\n\n` +
      `Код активации:\n\`\`\`\n${code}\n\`\`\`\n\n` +
      `План: ${planLabel(plan)}\n\n` +
      `Передайте этот код пользователю. Он вводится при первом входе на сайте.`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("Failed to create license:", err);
    await bot.sendMessage(chatId, "❌ Ошибка при создании лицензии. Попробуйте снова.");
  }
});

bot.on("polling_error", (err) => {
  console.error("[TelegramBot] Polling error:", err.message);
});

console.log("[TelegramBot] Bot started successfully.");

export default bot;
