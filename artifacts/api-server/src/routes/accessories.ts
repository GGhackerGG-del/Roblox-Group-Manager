import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { accessories, userAccessories, minigamePlays, platformUsers } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
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
        const ownedIds = (await txDb.select({ accessoryId: userAccessories.accessoryId })
          .from(userAccessories)
          .where(eq(userAccessories.userId, user.id))).map(r => r.accessoryId);

        const now = new Date();
        let available = await txDb.select().from(accessories)
          .where(eq(accessories.isActive, true));

        available = available.filter(a => {
          if (ownedIds.includes(a.id)) return false;
          if (a.obtainMethod === "event") {
            if (a.availableFrom && a.availableFrom > now) return false;
            if (a.availableUntil && a.availableUntil < now) return false;
          }
          return true;
        });

        if (available.length > 0) {
          const weights: Record<string, number> = { common: 40, rare: 30, epic: 20, legendary: 10 };
          const weighted = available.flatMap(a => Array(weights[a.rarity] || 10).fill(a));
          rewardAccessory = weighted[Math.floor(Math.random() * weighted.length)];

          await txDb.insert(userAccessories).values({
            userId: user.id,
            accessoryId: rewardAccessory.id,
          }).onConflictDoNothing();
        } else {
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

export default router;
