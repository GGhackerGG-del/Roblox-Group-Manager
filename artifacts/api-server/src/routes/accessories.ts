import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { accessories, userAccessories, minigamePlays, platformUsers, gameChallenges, quests, userQuests } from "@workspace/db";
import { eq, and, desc, sql, or, ne, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";

const router: IRouter = Router();

async function getPlatformUser(robloxUserId: number) {
  return db.query.platformUsers.findFirst({
    where: eq(platformUsers.robloxUserId, robloxUserId),
  });
}

router.get("/accessories/catalog", async (req, res): Promise<void> => {
  try {
    const now = new Date();
    const items = await db.select().from(accessories)
      .where(eq(accessories.isActive, true))
      .orderBy(accessories.category, accessories.rarity);

    const filtered = items.filter(item => {
      if (item.availableFrom && item.availableFrom > now) return false;
      if (item.availableUntil && item.availableUntil < now) return false;
      return true;
    });

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch catalog" });
  }
});

router.get("/accessories/my", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const rows = await db.select({
      ua: userAccessories,
      acc: accessories,
    })
      .from(userAccessories)
      .innerJoin(accessories, eq(userAccessories.accessoryId, accessories.id))
      .where(eq(userAccessories.userId, user.id))
      .orderBy(desc(userAccessories.obtainedAt));

    res.json(rows.map(r => ({ ...r.acc, equipped: r.ua.equipped, obtainedAt: r.ua.obtainedAt, userAccessoryId: r.ua.id })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

router.get("/accessories/user/:userId", async (req, res): Promise<void> => {
  try {
    const userId = parseInt(req.params.userId);
    const rows = await db.select({
      ua: userAccessories,
      acc: accessories,
    })
      .from(userAccessories)
      .innerJoin(accessories, eq(userAccessories.accessoryId, accessories.id))
      .where(and(eq(userAccessories.userId, userId), eq(userAccessories.equipped, true)));

    res.json(rows.map(r => ({ ...r.acc, equipped: true })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user accessories" });
  }
});

router.post("/accessories/equip", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const { accessoryId } = req.body as { accessoryId: number };
    if (!accessoryId || isNaN(accessoryId)) { res.status(400).json({ error: "Invalid accessoryId" }); return; }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client, { schema });

      const ua = await txDb.query.userAccessories.findFirst({
        where: and(eq(userAccessories.userId, user.id), eq(userAccessories.accessoryId, accessoryId)),
      });
      if (!ua) { await client.query("ROLLBACK"); res.status(404).json({ error: "You don't own this accessory" }); return; }

      const acc = await txDb.query.accessories.findFirst({ where: eq(accessories.id, accessoryId) });
      if (!acc) { await client.query("ROLLBACK"); res.status(404).json({ error: "Accessory not found" }); return; }

      await txDb.update(userAccessories)
        .set({ equipped: false })
        .where(and(
          eq(userAccessories.userId, user.id),
          eq(userAccessories.equipped, true),
          sql`${userAccessories.accessoryId} IN (SELECT id FROM accessories WHERE category = ${acc.category})`
        ));

      await txDb.update(userAccessories)
        .set({ equipped: true })
        .where(eq(userAccessories.id, ua.id));

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    res.status(500).json({ error: "Failed to equip" });
  }
});

router.post("/accessories/unequip", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const { accessoryId } = req.body as { accessoryId: number };

    await db.update(userAccessories)
      .set({ equipped: false })
      .where(and(eq(userAccessories.userId, user.id), eq(userAccessories.accessoryId, accessoryId)));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to unequip" });
  }
});

const GAME_TYPES = ["rps", "number-war", "dice-battle", "trivia", "coin-battle"] as const;
type GameType = typeof GAME_TYPES[number];

const TRIVIA_QUESTIONS = [
  { q: "What year was Roblox released?", qRu: "В каком году вышел Roblox?", qEs: "¿En qué año se lanzó Roblox?", options: ["2004", "2006", "2008", "2010"], answer: 1 },
  { q: "What is the in-game currency in Roblox?", qRu: "Какая валюта в Roblox?", qEs: "¿Cuál es la moneda de Roblox?", options: ["Coins", "Robux", "Gems", "Tickets"], answer: 1 },
  { q: "What language are Roblox scripts written in?", qRu: "На каком языке пишут скрипты в Roblox?", qEs: "¿En qué lenguaje se escriben los scripts de Roblox?", options: ["Python", "Java", "Luau", "C++"], answer: 2 },
  { q: "What is Roblox Studio used for?", qRu: "Для чего используется Roblox Studio?", qEs: "¿Para qué se usa Roblox Studio?", options: ["Playing games", "Creating games", "Trading items", "Chatting"], answer: 1 },
  { q: "What was the old currency before Robux?", qRu: "Какая валюта была до Робуксов?", qEs: "¿Cuál era la moneda antes de Robux?", options: ["Tix", "Gold", "Stars", "Bux"], answer: 0 },
  { q: "What is the max players in a Roblox server?", qRu: "Максимум игроков на сервере Roblox?", qEs: "¿Máximo de jugadores en un servidor de Roblox?", options: ["50", "100", "200", "700"], answer: 1 },
  { q: "Who founded Roblox?", qRu: "Кто основал Roblox?", qEs: "¿Quién fundó Roblox?", options: ["David Baszucki", "Mark Zuckerberg", "Elon Musk", "Tim Sweeney"], answer: 0 },
  { q: "What is R6 in Roblox?", qRu: "Что такое R6 в Roblox?", qEs: "¿Qué es R6 en Roblox?", options: ["6 players", "6-joint avatar", "6 tools", "6 teams"], answer: 1 },
  { q: "What does UGC stand for in Roblox?", qRu: "Что означает UGC в Roblox?", qEs: "¿Qué significa UGC en Roblox?", options: ["Ultimate Game Creator", "User Generated Content", "Universal Game Console", "User Game Credits"], answer: 1 },
  { q: "What is the Roblox marketplace called?", qRu: "Как называется маркетплейс Roblox?", qEs: "¿Cómo se llama el marketplace de Roblox?", options: ["Store", "Catalog", "Shop", "Market"], answer: 1 },
  { q: "What year did Roblox go public (IPO)?", qRu: "В каком году Roblox вышел на IPO?", qEs: "¿En qué año Roblox salió a bolsa?", options: ["2019", "2020", "2021", "2022"], answer: 2 },
  { q: "What is DevEx in Roblox?", qRu: "Что такое DevEx в Roblox?", qEs: "¿Qué es DevEx en Roblox?", options: ["Development Extension", "Developer Exchange", "Device Export", "Dev Experience"], answer: 1 },
  { q: "What is the minimum age to play Roblox?", qRu: "Минимальный возраст для Roblox?", qEs: "¿Edad mínima para jugar Roblox?", options: ["6", "8", "10", "13"], answer: 0 },
  { q: "How many Robux in a $1 purchase?", qRu: "Сколько Робуксов за $1?", qEs: "¿Cuántos Robux por $1?", options: ["50", "80", "100", "120"], answer: 1 },
  { q: "What type of game is Adopt Me?", qRu: "Какой жанр у Adopt Me?", qEs: "¿Qué tipo de juego es Adopt Me?", options: ["FPS", "RPG", "Pet Simulator", "Racing"], answer: 2 },
];

function pickTriviaQuestions(count: number) {
  const shuffled = [...TRIVIA_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((q, i) => ({
    id: i,
    question: q.q,
    questionRu: q.qRu,
    questionEs: q.qEs,
    options: q.options,
  }));
}

function checkTriviaAnswers(questionIds: number[], answers: number[]): number {
  const shuffled = [...TRIVIA_QUESTIONS];
  let correct = 0;
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] === TRIVIA_QUESTIONS[questionIds[i]]?.answer) correct++;
  }
  return correct;
}

function resolveGame(gameType: string, challengerMove: any, opponentMove: any): { winnerId: "challenger" | "opponent" | "draw"; details: any } {
  if (gameType === "rps") {
    const moves = ["rock", "paper", "scissors"];
    const c = challengerMove.choice;
    const o = opponentMove.choice;
    if (c === o) return { winnerId: "draw", details: { challengerChoice: c, opponentChoice: o } };
    const wins: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };
    return {
      winnerId: wins[c] === o ? "challenger" : "opponent",
      details: { challengerChoice: c, opponentChoice: o },
    };
  }

  if (gameType === "number-war") {
    const target = Math.floor(Math.random() * 100) + 1;
    const cDist = Math.abs(challengerMove.number - target);
    const oDist = Math.abs(opponentMove.number - target);
    if (cDist === oDist) return { winnerId: "draw", details: { target, challengerNumber: challengerMove.number, opponentNumber: opponentMove.number } };
    return {
      winnerId: cDist < oDist ? "challenger" : "opponent",
      details: { target, challengerNumber: challengerMove.number, opponentNumber: opponentMove.number },
    };
  }

  if (gameType === "dice-battle") {
    const cRolls = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const oRolls = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const cTotal = cRolls.reduce((a, b) => a + b, 0);
    const oTotal = oRolls.reduce((a, b) => a + b, 0);
    if (cTotal === oTotal) return { winnerId: "draw", details: { challengerRolls: cRolls, opponentRolls: oRolls, challengerTotal: cTotal, opponentTotal: oTotal } };
    return {
      winnerId: cTotal > oTotal ? "challenger" : "opponent",
      details: { challengerRolls: cRolls, opponentRolls: oRolls, challengerTotal: cTotal, opponentTotal: oTotal },
    };
  }

  if (gameType === "trivia") {
    const cCorrect = challengerMove.correct || 0;
    const oCorrect = opponentMove.correct || 0;
    if (cCorrect === oCorrect) return { winnerId: "draw", details: { challengerCorrect: cCorrect, opponentCorrect: oCorrect } };
    return {
      winnerId: cCorrect > oCorrect ? "challenger" : "opponent",
      details: { challengerCorrect: cCorrect, opponentCorrect: oCorrect },
    };
  }

  if (gameType === "coin-battle") {
    const rounds = 3;
    let cWins = 0;
    let oWins = 0;
    const results: any[] = [];
    for (let i = 0; i < rounds; i++) {
      const flip = Math.random() < 0.5 ? "heads" : "tails";
      const cPick = challengerMove.choices?.[i] || "heads";
      const oPick = opponentMove.choices?.[i] || "tails";
      const cWon = cPick === flip;
      const oWon = oPick === flip;
      if (cWon && !oWon) cWins++;
      else if (oWon && !cWon) oWins++;
      results.push({ flip, challengerPick: cPick, opponentPick: oPick });
    }
    if (cWins === oWins) return { winnerId: "draw", details: { rounds: results, challengerWins: cWins, opponentWins: oWins } };
    return {
      winnerId: cWins > oWins ? "challenger" : "opponent",
      details: { rounds: results, challengerWins: cWins, opponentWins: oWins },
    };
  }

  return { winnerId: "draw", details: {} };
}

async function awardAccessory(txDb: any, userId: number): Promise<any | null> {
  const ownedIds = (await txDb.select({ accessoryId: userAccessories.accessoryId })
    .from(userAccessories)
    .where(eq(userAccessories.userId, userId))).map((r: any) => r.accessoryId);

  const now = new Date();
  let available = await txDb.select().from(accessories)
    .where(eq(accessories.isActive, true));

  available = available.filter((a: any) => {
    if (ownedIds.includes(a.id)) return false;
    if (a.obtainMethod === "event") {
      if (a.availableFrom && a.availableFrom > now) return false;
      if (a.availableUntil && a.availableUntil < now) return false;
    }
    return true;
  });

  if (available.length === 0) return null;

  const weights: Record<string, number> = { common: 40, rare: 30, epic: 20, legendary: 10 };
  const weighted = available.flatMap((a: any) => Array(weights[a.rarity] || 10).fill(a));
  const reward = weighted[Math.floor(Math.random() * weighted.length)];

  await txDb.insert(userAccessories).values({
    userId,
    accessoryId: reward.id,
  }).onConflictDoNothing();

  return reward;
}

function validateMove(gameType: string, move: any): string | null {
  if (gameType === "rps") {
    if (!move?.choice || !["rock", "paper", "scissors"].includes(move.choice)) {
      return "RPS move must be rock, paper, or scissors";
    }
  }
  if (gameType === "number-war") {
    const n = move?.number;
    if (typeof n !== "number" || n < 1 || n > 100 || !Number.isInteger(n)) {
      return "Number must be an integer between 1 and 100";
    }
  }
  if (gameType === "coin-battle") {
    const choices = move?.choices;
    if (!Array.isArray(choices) || choices.length !== 3 || choices.some((c: any) => c !== "heads" && c !== "tails")) {
      return "Coin battle requires 3 choices of heads or tails";
    }
  }
  return null;
}

router.post("/accessories/duels/create", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const { gameType, opponentId, move } = req.body as { gameType: string; opponentId?: number; move: any };
    if (!GAME_TYPES.includes(gameType as GameType)) { res.status(400).json({ error: "Invalid game type" }); return; }

    const activeCount = await db.select({ count: sql<number>`count(*)` })
      .from(gameChallenges)
      .where(and(
        eq(gameChallenges.challengerId, user.id),
        eq(gameChallenges.status, "pending"),
      ));
    if (Number(activeCount[0]?.count || 0) >= 5) {
      res.status(429).json({ error: "Too many active challenges (max 5)" }); return;
    }

    if (opponentId === user.id) { res.status(400).json({ error: "Cannot challenge yourself" }); return; }

    let challengerMove = move || {};
    const validationError = validateMove(gameType, challengerMove);
    if (validationError) { res.status(400).json({ error: validationError }); return; }

    if (gameType === "trivia") {
      const questionIds = move?.questionIds as number[] | undefined;
      if (!questionIds || !Array.isArray(questionIds) || questionIds.length !== 5 ||
          questionIds.some((id: number) => typeof id !== "number" || id < 0 || id >= TRIVIA_QUESTIONS.length)) {
        res.status(400).json({ error: "Invalid trivia question IDs" }); return;
      }
      const answers = move?.answers || [];
      const correct = answers.length ? checkTriviaAnswers(questionIds, answers) : 0;
      challengerMove = { answers, correct, questionIds };
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [challenge] = await db.insert(gameChallenges).values({
      gameType,
      challengerId: user.id,
      opponentId: opponentId || null,
      challengerMove,
      status: "pending",
      expiresAt,
    }).returning();

    const challengerUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.id, user.id) });

    res.json({
      challenge: {
        id: challenge.id,
        gameType: challenge.gameType,
        status: challenge.status,
        createdAt: challenge.createdAt,
        challengerName: challengerUser?.displayName || "User",
        challengerAvatar: challengerUser?.avatarUrl || null,
        challengerRobloxUserId: challengerUser?.robloxUserId || 0,
      },
    });
  } catch (err) {
    console.error("Create duel error:", err);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.post("/accessories/duels/:id/accept", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const challengeId = parseInt(req.params.id);
    const { move } = req.body as { move: any };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client, { schema });

      const lockResult = await client.query(
        `SELECT * FROM game_challenges WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [challengeId]
      );
      if (lockResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Challenge not found or already completed" }); return;
      }

      const ch = lockResult.rows[0];

      if (ch.challenger_id === user.id) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Cannot accept your own challenge" }); return;
      }

      if (ch.opponent_id && ch.opponent_id !== user.id) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "This challenge is not for you" }); return;
      }

      if (ch.expires_at && new Date(ch.expires_at) < new Date()) {
        await client.query(
          `UPDATE game_challenges SET status = 'expired' WHERE id = $1`,
          [challengeId]
        );
        await client.query("COMMIT");
        res.status(410).json({ error: "Challenge expired" }); return;
      }

      let opponentMove = move || {};
      const challengerMoveData = ch.challenger_move;

      if (ch.game_type !== "trivia" && ch.game_type !== "dice-battle") {
        const moveErr = validateMove(ch.game_type, opponentMove);
        if (moveErr) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: moveErr }); return;
        }
      }

      if (ch.game_type === "trivia") {
        const questionIds = challengerMoveData?.questionIds || [];
        const answers = move?.answers || [];
        if (!Array.isArray(answers) || answers.length !== 5) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Trivia requires exactly 5 answers" }); return;
        }
        const correct = checkTriviaAnswers(questionIds, answers);
        opponentMove = { answers, correct, questionIds };
      }

      const result = resolveGame(ch.game_type, challengerMoveData, opponentMove);
      let winnerId: number | null = null;
      if (result.winnerId === "challenger") winnerId = ch.challenger_id;
      else if (result.winnerId === "opponent") winnerId = user.id;

      let rewardAccessory = null;
      if (winnerId) {
        rewardAccessory = await awardAccessory(txDb, winnerId);
      }

      await client.query(
        `UPDATE game_challenges SET 
          opponent_id = $1,
          opponent_move = $2,
          winner_id = $3,
          reward_accessory_id = $4,
          status = 'completed',
          completed_at = NOW()
        WHERE id = $5`,
        [user.id, JSON.stringify(opponentMove), winnerId, rewardAccessory?.id || null, challengeId]
      );

      await client.query("COMMIT");

      const challengerUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.id, ch.challenger_id) });
      const opponentUser = await db.query.platformUsers.findFirst({ where: eq(platformUsers.id, user.id) });

      res.json({
        result: result.winnerId,
        details: result.details,
        winner: winnerId ? {
          id: winnerId,
          name: winnerId === ch.challenger_id ? challengerUser?.displayName : opponentUser?.displayName,
        } : null,
        reward: rewardAccessory ? {
          id: rewardAccessory.id,
          name: rewardAccessory.name,
          nameRu: rewardAccessory.nameRu,
          nameEs: rewardAccessory.nameEs,
          icon: rewardAccessory.icon,
          rarity: rewardAccessory.rarity,
          category: rewardAccessory.category,
        } : null,
        challengerName: challengerUser?.displayName,
        opponentName: opponentUser?.displayName,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("Accept duel error:", err);
    res.status(500).json({ error: "Failed to accept challenge" });
  }
});

router.get("/accessories/duels", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    await db.update(gameChallenges)
      .set({ status: "expired" })
      .where(and(
        eq(gameChallenges.status, "pending"),
        sql`${gameChallenges.expiresAt} < NOW()`
      ));

    const openChallenges = await db.select()
      .from(gameChallenges)
      .where(and(
        eq(gameChallenges.status, "pending"),
        or(
          sql`${gameChallenges.opponentId} IS NULL`,
          eq(gameChallenges.opponentId, user.id),
        ),
        ne(gameChallenges.challengerId, user.id),
      ))
      .orderBy(desc(gameChallenges.createdAt))
      .limit(20);

    const myChallenges = await db.select()
      .from(gameChallenges)
      .where(and(
        eq(gameChallenges.challengerId, user.id),
        eq(gameChallenges.status, "pending"),
      ))
      .orderBy(desc(gameChallenges.createdAt))
      .limit(10);

    const recentResults = await db.select()
      .from(gameChallenges)
      .where(and(
        eq(gameChallenges.status, "completed"),
        or(
          eq(gameChallenges.challengerId, user.id),
          eq(gameChallenges.opponentId, user.id),
        ),
      ))
      .orderBy(desc(gameChallenges.completedAt))
      .limit(15);

    const userIds = new Set<number>();
    [...openChallenges, ...myChallenges, ...recentResults].forEach(c => {
      userIds.add(c.challengerId);
      if (c.opponentId) userIds.add(c.opponentId);
      if (c.winnerId) userIds.add(c.winnerId);
    });

    const userArr = userIds.size > 0 ? await db.select({
      id: platformUsers.id,
      displayName: platformUsers.displayName,
      avatarUrl: platformUsers.avatarUrl,
      robloxUserId: platformUsers.robloxUserId,
    })
      .from(platformUsers)
      .where(inArray(platformUsers.id, [...userIds])) : [];

    const usersMap = Object.fromEntries(userArr.map(u => [u.id, u]));

    const enrich = (c: any, isOpen = false) => {
      const base: any = {
        id: c.id,
        gameType: c.gameType,
        challengerId: c.challengerId,
        opponentId: c.opponentId,
        winnerId: c.winnerId,
        rewardAccessoryId: c.rewardAccessoryId,
        status: c.status,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
        challengerName: usersMap[c.challengerId]?.displayName || "User",
        challengerAvatar: usersMap[c.challengerId]?.avatarUrl,
        challengerRobloxUserId: usersMap[c.challengerId]?.robloxUserId || 0,
        opponentName: c.opponentId ? usersMap[c.opponentId]?.displayName || "User" : null,
        opponentAvatar: c.opponentId ? usersMap[c.opponentId]?.avatarUrl : null,
        opponentRobloxUserId: c.opponentId ? usersMap[c.opponentId]?.robloxUserId || 0 : null,
        winnerName: c.winnerId ? usersMap[c.winnerId]?.displayName || "User" : null,
      };
      if (c.gameType === "trivia" && c.challengerMove?.questionIds) {
        base.triviaQuestionIds = c.challengerMove.questionIds;
      }
      return base;
    };

    res.json({
      open: openChallenges.map(c => enrich(c, true)),
      mine: myChallenges.map(c => enrich(c, false)),
      results: recentResults.map(c => enrich(c, false)),
      myUserId: user.id,
    });
  } catch (err) {
    console.error("Fetch duels error:", err);
    res.status(500).json({ error: "Failed to fetch duels" });
  }
});

router.delete("/accessories/duels/:id", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const challengeId = parseInt(req.params.id);

    await db.update(gameChallenges)
      .set({ status: "cancelled" })
      .where(and(
        eq(gameChallenges.id, challengeId),
        eq(gameChallenges.challengerId, user.id),
        eq(gameChallenges.status, "pending"),
      ));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel challenge" });
  }
});

router.get("/accessories/duels/leaderboard", async (req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT 
        u.id,
        u.display_name,
        u.avatar_url,
        u.roblox_user_id,
        COUNT(CASE WHEN gc.winner_id = u.id THEN 1 END)::int as wins,
        COUNT(gc.id)::int as total_games,
        COUNT(CASE WHEN gc.winner_id = u.id THEN 1 END)::float / NULLIF(COUNT(gc.id), 0) as win_rate
      FROM platform_users u
      JOIN game_challenges gc ON (gc.challenger_id = u.id OR gc.opponent_id = u.id) AND gc.status = 'completed'
      GROUP BY u.id
      HAVING COUNT(gc.id) >= 3
      ORDER BY wins DESC, win_rate DESC
      LIMIT 20
    `);

    res.json(rows.rows || []);
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/accessories/duels/trivia-questions", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const idsParam = req.query.ids as string | undefined;
    if (idsParam) {
      const questionIds = idsParam.split(",").map(Number).filter(n => !isNaN(n) && n >= 0 && n < TRIVIA_QUESTIONS.length);
      if (questionIds.length !== 5) { res.status(400).json({ error: "Invalid question IDs" }); return; }
      const questions = questionIds.map((idx, i) => ({
        id: i,
        question: TRIVIA_QUESTIONS[idx].q,
        questionRu: TRIVIA_QUESTIONS[idx].qRu,
        questionEs: TRIVIA_QUESTIONS[idx].qEs,
        options: TRIVIA_QUESTIONS[idx].options,
      }));
      res.json({ questions, questionIds });
    } else {
      const questions = pickTriviaQuestions(5);
      const questionIds = questions.map(q => TRIVIA_QUESTIONS.findIndex(tq => tq.q === q.question));
      res.json({ questions, questionIds });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to get questions" });
  }
});

const GAME_COOLDOWNS: Record<string, number> = {
  "daily-spin": 24 * 60 * 60 * 1000,
  "coin-flip": 30 * 1000,
  "dice-roll": 30 * 1000,
  "number-guess": 60 * 1000,
  "slot-machine": 45 * 1000,
};

const GAME_WIN_CHANCES: Record<string, number> = {
  "daily-spin": 0.4,
  "coin-flip": 0.35,
  "dice-roll": 0.25,
  "number-guess": 0.2,
  "slot-machine": 0.15,
};

router.post("/accessories/minigame/:gameId/play", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const gameId = req.params.gameId;

    if (!GAME_COOLDOWNS[gameId]) { res.status(400).json({ error: "Unknown game" }); return; }

    const { choice } = req.body as { choice?: string | number };
    if (gameId === "coin-flip" && choice !== "heads" && choice !== "tails") {
      res.status(400).json({ error: "Invalid choice, must be heads or tails" }); return;
    }
    if (gameId === "number-guess") {
      const n = typeof choice === "number" ? choice : parseInt(choice as string);
      if (isNaN(n) || n < 1 || n > 10) { res.status(400).json({ error: "Choose a number 1-10" }); return; }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client, { schema });

      const lockResult = await client.query(
        `SELECT played_at FROM minigame_plays WHERE user_id = $1 AND game_id = $2 ORDER BY played_at DESC LIMIT 1 FOR UPDATE`,
        [user.id, gameId]
      );

      if (lockResult.rows.length > 0) {
        const elapsed = Date.now() - new Date(lockResult.rows[0].played_at).getTime();
        if (elapsed < GAME_COOLDOWNS[gameId]) {
          const remaining = Math.ceil((GAME_COOLDOWNS[gameId] - elapsed) / 1000);
          await client.query("ROLLBACK");
          res.status(429).json({ error: "Cooldown active", remaining });
          return;
        }
      }

      let won = false;
      let gameResult: any = {};

      if (gameId === "daily-spin") {
        won = Math.random() < GAME_WIN_CHANCES[gameId];
        gameResult = { spin: true };
      } else if (gameId === "coin-flip") {
        const result = Math.random() < 0.5 ? "heads" : "tails";
        won = result === choice;
        gameResult = { result, yourChoice: choice };
      } else if (gameId === "dice-roll") {
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        won = dice1 === dice2;
        gameResult = { dice1, dice2, doubles: won };
      } else if (gameId === "number-guess") {
        const target = Math.floor(Math.random() * 10) + 1;
        const guess = typeof choice === "number" ? choice : parseInt(choice as string);
        won = target === guess;
        gameResult = { target, yourGuess: guess };
      } else if (gameId === "slot-machine") {
        const symbols = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];
        won = r1 === r2 && r2 === r3;
        const twoMatch = r1 === r2 || r2 === r3 || r1 === r3;
        if (!won && twoMatch && Math.random() < 0.3) won = true;
        gameResult = { reels: [r1, r2, r3] };
      }

      let rewardAccessory = null;

      if (won) {
        rewardAccessory = await awardAccessory(txDb, user.id);
        if (!rewardAccessory) {
          won = false;
          gameResult.allOwned = true;
        }
      }

      await txDb.insert(minigamePlays).values({
        userId: user.id,
        gameId,
        won,
        rewardAccessoryId: rewardAccessory?.id || null,
      });

      await client.query("COMMIT");

      res.json({
        won,
        game: gameResult,
        reward: rewardAccessory ? {
          id: rewardAccessory.id,
          name: rewardAccessory.name,
          nameRu: rewardAccessory.nameRu,
          nameEs: rewardAccessory.nameEs,
          icon: rewardAccessory.icon,
          rarity: rewardAccessory.rarity,
          category: rewardAccessory.category,
        } : null,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("Minigame error:", err);
    res.status(500).json({ error: "Game error" });
  }
});

router.get("/accessories/minigame/stats", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const games = Object.keys(GAME_COOLDOWNS);
    const stats: Record<string, any> = {};

    for (const gameId of games) {
      const lastPlay = await db.select().from(minigamePlays)
        .where(and(eq(minigamePlays.userId, user.id), eq(minigamePlays.gameId, gameId)))
        .orderBy(desc(minigamePlays.playedAt))
        .limit(1);

      const totalPlays = await db.select({ count: sql<number>`count(*)` })
        .from(minigamePlays)
        .where(and(eq(minigamePlays.userId, user.id), eq(minigamePlays.gameId, gameId)));

      const wins = await db.select({ count: sql<number>`count(*)` })
        .from(minigamePlays)
        .where(and(eq(minigamePlays.userId, user.id), eq(minigamePlays.gameId, gameId), eq(minigamePlays.won, true)));

      let cooldownRemaining = 0;
      if (lastPlay.length > 0) {
        const elapsed = Date.now() - new Date(lastPlay[0].playedAt).getTime();
        if (elapsed < GAME_COOLDOWNS[gameId]) {
          cooldownRemaining = Math.ceil((GAME_COOLDOWNS[gameId] - elapsed) / 1000);
        }
      }

      stats[gameId] = {
        totalPlays: Number(totalPlays[0]?.count || 0),
        wins: Number(wins[0]?.count || 0),
        cooldownRemaining,
      };
    }

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/accessories/quests", async (req, res): Promise<void> => {
  try {
    const allQuests = await db.select().from(quests).where(eq(quests.isActive, true));

    const robloxUserId = req.session.robloxUserId;
    let userProgress: any[] = [];
    let ownedAccessoryIds: number[] = [];

    if (robloxUserId) {
      const user = await getPlatformUser(robloxUserId);
      if (user) {
        userProgress = await db.select().from(userQuests).where(eq(userQuests.userId, user.id));
        ownedAccessoryIds = (await db.select({ accessoryId: userAccessories.accessoryId })
          .from(userAccessories)
          .where(eq(userAccessories.userId, user.id))).map(r => r.accessoryId);
      }
    }

    const allAccessories = await db.select().from(accessories).where(eq(accessories.isActive, true));
    const accessoryMap = Object.fromEntries(allAccessories.map(a => [a.id, a]));

    const userId = robloxUserId ? (await getPlatformUser(robloxUserId))?.id : undefined;

    const questsWithProgress = await Promise.all(allQuests.map(async (q) => {
      const up = userProgress.find(p => p.questId === q.id);
      const reward = accessoryMap[q.rewardAccessoryId];
      let progress = up?.progress || 0;
      let completed = up?.completed || false;
      if (up && !up.claimedAt && userId) {
        progress = Math.min(await computeQuestProgress(userId, q.type), q.target);
        completed = progress >= q.target;
      }
      return {
        ...q,
        progress,
        completed,
        claimed: !!up?.claimedAt,
        started: !!up,
        alreadyOwned: ownedAccessoryIds.includes(q.rewardAccessoryId),
        reward: reward ? { id: reward.id, name: reward.name, icon: reward.icon, rarity: reward.rarity, category: reward.category } : null,
      };
    }));

    res.json({ quests: questsWithProgress });
  } catch (err) {
    console.error("Quest fetch error:", err);
    res.status(500).json({ error: "Failed to fetch quests" });
  }
});

router.post("/accessories/quests/:questId/start", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const questId = parseInt(req.params.questId);
  if (isNaN(questId)) { res.status(400).json({ error: "Invalid quest ID" }); return; }

  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const quest = await db.select().from(quests).where(and(eq(quests.id, questId), eq(quests.isActive, true))).limit(1);
    if (quest.length === 0) { res.status(404).json({ error: "Quest not found" }); return; }

    const existing = await db.select().from(userQuests).where(and(eq(userQuests.userId, user.id), eq(userQuests.questId, questId))).limit(1);
    if (existing.length > 0) { res.status(400).json({ error: "Quest already started" }); return; }

    const owned = await db.select().from(userAccessories)
      .where(and(eq(userAccessories.userId, user.id), eq(userAccessories.accessoryId, quest[0].rewardAccessoryId))).limit(1);
    if (owned.length > 0) { res.status(400).json({ error: "You already own this reward" }); return; }

    const currentProgress = await computeQuestProgress(user.id, quest[0].type);

    await db.insert(userQuests).values({
      userId: user.id,
      questId,
      progress: Math.min(currentProgress, quest[0].target),
      completed: currentProgress >= quest[0].target,
    });

    res.json({ success: true, progress: Math.min(currentProgress, quest[0].target), target: quest[0].target });
  } catch (err) {
    console.error("Quest start error:", err);
    res.status(500).json({ error: "Failed to start quest" });
  }
});

router.post("/accessories/quests/:questId/claim", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const questId = parseInt(req.params.questId);
  if (isNaN(questId)) { res.status(400).json({ error: "Invalid quest ID" }); return; }

  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const quest = await db.select().from(quests).where(and(eq(quests.id, questId), eq(quests.isActive, true))).limit(1);
    if (quest.length === 0) { res.status(404).json({ error: "Quest not found" }); return; }

    const uq = await db.select().from(userQuests).where(and(eq(userQuests.userId, user.id), eq(userQuests.questId, questId))).limit(1);
    if (uq.length === 0) { res.status(400).json({ error: "Quest not started" }); return; }
    if (uq[0].claimedAt) { res.status(400).json({ error: "Already claimed" }); return; }

    const currentProgress = await computeQuestProgress(user.id, quest[0].type);
    if (currentProgress < quest[0].target) {
      await db.update(userQuests).set({ progress: currentProgress }).where(eq(userQuests.id, uq[0].id));
      res.status(400).json({ error: "Quest not complete", progress: currentProgress, target: quest[0].target });
      return;
    }

    await db.update(userQuests).set({
      progress: quest[0].target,
      completed: true,
      claimedAt: new Date(),
    }).where(eq(userQuests.id, uq[0].id));

    await db.insert(userAccessories).values({
      userId: user.id,
      accessoryId: quest[0].rewardAccessoryId,
    }).onConflictDoNothing();

    const reward = await db.select().from(accessories).where(eq(accessories.id, quest[0].rewardAccessoryId)).limit(1);

    res.json({ success: true, reward: reward[0] || null });
  } catch (err) {
    console.error("Quest claim error:", err);
    res.status(500).json({ error: "Failed to claim quest" });
  }
});

router.post("/accessories/quests/refresh", async (req, res): Promise<void> => {
  const robloxUserId = req.session.robloxUserId;
  if (!robloxUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const user = await getPlatformUser(robloxUserId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const activeUserQuests = await db.select().from(userQuests)
      .where(and(eq(userQuests.userId, user.id), eq(userQuests.completed, false)));

    for (const uq of activeUserQuests) {
      const quest = await db.select().from(quests).where(eq(quests.id, uq.questId)).limit(1);
      if (quest.length === 0) continue;

      const currentProgress = await computeQuestProgress(user[0].id, quest[0].type);
      const capped = Math.min(currentProgress, quest[0].target);

      if (capped !== uq.progress) {
        await db.update(userQuests).set({
          progress: capped,
          completed: capped >= quest[0].target,
        }).where(eq(userQuests.id, uq.id));
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Quest refresh error:", err);
    res.status(500).json({ error: "Failed to refresh quests" });
  }
});

async function computeQuestProgress(userId: number, questType: string): Promise<number> {
  try {
    switch (questType) {
      case "send_messages": {
        const result = await db.execute(sql`
          SELECT (COALESCE((SELECT COUNT(*)::int FROM dm_messages WHERE sender_id = ${userId}), 0) +
                  COALESCE((SELECT COUNT(*)::int FROM group_chat_messages WHERE sender_id = ${userId}), 0)) as count
        `);
        return (result as any).rows?.[0]?.count || 0;
      }
      case "add_friends": {
        const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM friendships WHERE (requester_id = ${userId} OR addressee_id = ${userId}) AND status = 'accepted'`);
        return (result as any).rows?.[0]?.count || 0;
      }
      case "create_posts": {
        const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM posts WHERE author_id = ${userId}`);
        return (result as any).rows?.[0]?.count || 0;
      }
      case "get_likes": {
        const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM post_likes pl JOIN posts p ON pl.post_id = p.id WHERE p.author_id = ${userId}`);
        return (result as any).rows?.[0]?.count || 0;
      }
      case "win_minigames": {
        const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM minigame_plays WHERE user_id = ${userId} AND won = true`);
        return (result as any).rows?.[0]?.count || 0;
      }
      case "win_duels": {
        const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM game_challenges WHERE winner_id = ${userId} AND status = 'completed'`);
        return (result as any).rows?.[0]?.count || 0;
      }
      default:
        return 0;
    }
  } catch (err) {
    console.error(`Quest progress compute error for type ${questType}:`, err);
    return 0;
  }
}

export default router;
