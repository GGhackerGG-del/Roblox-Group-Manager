import { Router } from "express";
import { db, gameVisitSnapshots } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";

const router = Router();

const GAMES_API = "https://games.roblox.com";
const THUMBNAILS_API = "https://thumbnails.roblox.com";
const VOTES_API = "https://games.roblox.com/v1/games/votes";

const alertStore = new Map<number, Map<number, { enabled: boolean; threshold: number }>>();

async function saveSnapshot(universeId: number, playing: number, visits: number) {
  const lastSnap = await db.query.gameVisitSnapshots.findFirst({
    where: eq(gameVisitSnapshots.universeId, universeId),
    orderBy: desc(gameVisitSnapshots.ts),
  });
  if (lastSnap && Date.now() - new Date(lastSnap.ts).getTime() < 300000) return;
  await db.insert(gameVisitSnapshots).values({ universeId, playing, visits });
}

async function getSnapshots(universeId: number) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const snaps = await db.query.gameVisitSnapshots.findMany({
    where: and(
      eq(gameVisitSnapshots.universeId, universeId),
      gte(gameVisitSnapshots.ts, thirtyDaysAgo),
    ),
    orderBy: gameVisitSnapshots.ts,
  });
  return snaps.map(s => ({ ts: new Date(s.ts).getTime(), playing: s.playing, visits: Number(s.visits) }));
}

function getHeaders(cookie: string) {
  return {
    "Cookie": `.ROBLOSECURITY=${cookie}`,
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.roblox.com/",
  };
}

// GET /game-manager/groups/:groupId/games — list all games in a group with details
router.get("/game-manager/groups/:groupId/games", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { groupId } = req.params;

  try {
    // 1. Fetch group games — try all access levels, then fallback to public only
    let games: any[] = [];
    for (const filter of ["All", "Public", "Private"]) {
      const gamesRes = await fetch(
        `${GAMES_API}/v2/groups/${groupId}/games?sortOrder=Asc&limit=100&accessFilter=${filter}`,
        { headers: getHeaders(cookie) }
      );
      if (gamesRes.ok) {
        const gamesData = await gamesRes.json() as any;
        const fetched: any[] = gamesData.data || [];
        if (fetched.length > 0) {
          const existingIds = new Set(games.map((g: any) => g.id));
          for (const g of fetched) {
            if (!existingIds.has(g.id)) { games.push(g); existingIds.add(g.id); }
          }
        }
        if (filter === "All" && fetched.length > 0) break;
      }
    }

    if (!games.length) { res.json({ games: [] }); return; }

    const universeIds = games.map((g: any) => g.id).join(",");

    // 2. Fetch live universe details, thumbnails, and votes
    const [detailsRes, thumbsRes, votesRes] = await Promise.all([
      fetch(`${GAMES_API}/v1/games?universeIds=${universeIds}`, { headers: getHeaders(cookie) }),
      fetch(`${THUMBNAILS_API}/v1/games/multiget/thumbnails?universeIds=${universeIds}&size=768x432&format=Png&isCircular=false`, { headers: getHeaders(cookie) }),
      fetch(`${VOTES_API}?universeIds=${universeIds}`, { headers: getHeaders(cookie) }),
    ]);

    const detailsData = await detailsRes.json() as any;
    const thumbsData = await thumbsRes.json() as any;
    const votesData = await votesRes.json().catch(() => ({ data: [] })) as any;

    const detailsMap: Record<number, any> = {};
    for (const d of (detailsData.data || [])) detailsMap[d.id] = d;

    const thumbsMap: Record<number, string> = {};
    for (const t of (thumbsData.data || [])) {
      if (t.thumbnails?.[0]?.imageUrl) thumbsMap[t.universeId] = t.thumbnails[0].imageUrl;
    }

    const votesMap: Record<number, { up: number; down: number }> = {};
    for (const v of (votesData.data || [])) {
      votesMap[v.id] = { up: v.upVotes ?? 0, down: v.downVotes ?? 0 };
    }

    // 3. Record snapshot for history (persisted to DB)
    const result = games.map((g: any) => {
      const detail = detailsMap[g.id] || {};
      saveSnapshot(g.id, detail.playing ?? 0, detail.visits ?? 0).catch(() => {});
      return {
        universeId: g.id,
        name: detail.name || g.name,
        description: detail.description || g.description,
        placeId: detail.rootPlaceId,
        creator: detail.creator,
        maxPlayers: detail.maxPlayers,
        allowedGearGenres: detail.allowedGearGenres,
        isAllGenre: detail.isAllGenre,
        playing: detail.playing ?? 0,
        visits: detail.visits ?? 0,
        favoritedCount: detail.favoritedCount ?? 0,
        likeCount: votesMap[g.id]?.up ?? detail.likeCount ?? 0,
        dislikeCount: votesMap[g.id]?.down ?? detail.dislikeCount ?? 0,
        created: detail.created,
        updated: detail.updated,
        thumbnail: thumbsMap[g.id] || null,
      };
    });

    res.json({ games: result });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Error" });
  }
});

router.get("/game-manager/universe/:universeId/history", async (req, res): Promise<void> => {
  const cookie = req.session.robloxCookie;
  if (!cookie) { res.status(401).json({ error: "Not authenticated" }); return; }
  const uid = parseInt(req.params.universeId);

  try {
    const detailRes = await fetch(`${GAMES_API}/v1/games?universeIds=${uid}`, { headers: getHeaders(cookie) });
    if (detailRes.ok) {
      const detailData = await detailRes.json() as any;
      const d = (detailData.data || [])[0];
      if (d) {
        await saveSnapshot(uid, d.playing ?? 0, d.visits ?? 0);
      }
    }
  } catch {}

  const snaps = await getSnapshots(uid);
  res.json({ snapshots: snaps });
});

// GET /game-manager/universe/:universeId/alerts — get alert settings
router.get("/game-manager/universe/:universeId/alerts", async (req, res): Promise<void> => {
  const userId = req.session.robloxUserId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const uid = parseInt(req.params.universeId);
  const settings = alertStore.get(userId)?.get(uid) || { enabled: false, threshold: 20 };
  res.json({ settings });
});

// POST /game-manager/universe/:universeId/alerts — save alert settings
router.post("/game-manager/universe/:universeId/alerts", async (req, res): Promise<void> => {
  const userId = req.session.robloxUserId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const uid = parseInt(req.params.universeId);
  const { enabled, threshold } = req.body;
  if (!alertStore.has(userId)) alertStore.set(userId, new Map());
  alertStore.get(userId)!.set(uid, { enabled: !!enabled, threshold: Number(threshold) || 20 });
  res.json({ ok: true });
});

// GET /game-manager/alerts/check — check all enabled alerts for drops
router.get("/game-manager/alerts/check", async (req, res): Promise<void> => {
  const userId = req.session.robloxUserId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const userAlerts = alertStore.get(userId);
  if (!userAlerts) { res.json({ alerts: [] }); return; }

  const triggered: { universeId: number; current: number; previous: number; drop: number }[] = [];

  for (const [uid, settings] of userAlerts.entries()) {
    if (!settings.enabled) continue;
    const snaps = await getSnapshots(uid);
    if (snaps.length < 2) continue;
    const current = snaps[snaps.length - 1].playing;
    const previous = snaps[snaps.length - 2].playing;
    if (previous <= 0) continue;
    const dropPct = ((previous - current) / previous) * 100;
    if (dropPct >= settings.threshold) {
      triggered.push({ universeId: uid, current, previous, drop: Math.round(dropPct) });
    }
  }

  res.json({ alerts: triggered });
});

export default router;
