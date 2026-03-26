# Limited.Ink — Project Overview

## What This Is
A full-stack React web app for managing Roblox groups. Monetized via license codes distributed through a Telegram bot (499₽/week, 1499₽/month, 2999₽ lifetime).

## Architecture

### Monorepo Structure
- `artifacts/limited-ink/` — React + Vite frontend (served at `/`)
- `artifacts/api-server/` — Express backend API (served at `/api/`)
- `lib/api-spec/` — OpenAPI 3.0 spec + Orval codegen config
- `lib/api-client-react/` — Auto-generated React Query hooks (from Orval codegen)
- `lib/db/` — Drizzle ORM schema + migrations (PostgreSQL)

### Frontend Pages
- `Activation.tsx` — License code entry (split-screen, XXXX-XXXX-XXXX-XXXX format)
- `RobloxLogin.tsx` — Roblox cookie entry (sessionStorage only, never persisted in DB)
- `DashboardLayout.tsx` — Sidebar with owner groups list, user profile, license info, Tools section (AI Assistant, Competitors, Limited Sniper), Community & Settings links
- `Home.tsx` — Empty state when no group selected
- `GroupView.tsx` — 5-tab view: P&L, Catalog (search marketplace clothing by keyword/sort/price/group filter, copy to group or download template, bulk download, 3s search debounce), Clothing (browse group's own clothing with search filter, download templates), Upload (multi-file PNG drag-and-drop with template overlay compositing, bulk name/type/price/description settings, uses Open Cloud API with operation polling), Alt Accounts. Tab state persisted per group in localStorage. Default tab is P&L.
- `Community.tsx` — Social hub with VK-style left sidebar nav: Feed (posts/likes/comments), Forum (Suggestions/Off-topic/Q&A with voting & replies), Discover (find developers), Friends (requests, chat), Chat (DMs + group chats + voice calls + voice messages), Marketplace, Accessories (profile decorations via mini-games)
- `AccessoriesTab.tsx` — Profile accessories system: Inventory (equip/unequip items per category), Catalog (browse all available accessories by category/rarity), Mini Games (Daily Spin, Coin Flip, Dice Roll, Number Guess, Slot Machine — each with cooldowns and reward chances). Accessories display on user profiles. DB tables: `accessories`, `user_accessories`, `minigame_plays`. 27 seeded accessories across 5 categories (frame, badge, background, title, effect) with 4 rarities.
- `Settings.tsx` — Profile bio, Theme (light/dark/system), Notifications, Privacy (with Cookie Security info), Data export, License info, Audio (mic/speaker selection with live test), About. Side-nav layout.
- `Assistant.tsx` — AI chat assistant for Roblox development help (Lua scripts, moderation policies, clothing strategies, Discord posts). Uses SSE streaming. Supports markdown rendering (**bold**, *italic*, `code`, # ## ### headers). Chat/Image mode toggle. Image attachment support (paperclip button) for vision analysis. AI image generation mode.
- `Competitors.tsx` — Analyze any Roblox group by ID: member count, clothing stats, top items with thumbnails, all clothing toggle, pricing. Uses PageCacheContext for state persistence.
- `Sniper.tsx` — Limited Sniper tool with 8 tabs: Browse (search Rolimons data), Deals (undervalued/projected items), Underprice Detector (items with catalog price < RAP, requires Roblox session), Watchlist (live price check + manual buy + per-item Auto-Buy toggle), Snipe Bot (auto-monitor loop with configurable interval 30s–5min, auto-buys flagged items, alerts for non-auto items), RAP History (price/volume chart via Roblox resale-data endpoint using recharts), Trade Calculator (build Give/Receive lists, shows RAP+Value totals and profit/loss), Deal Log (localStorage history of bought/alerted/failed deals). localStorage watchlist + deal log persistence.

- `PnL.tsx` — Group-level Profit & Loss dashboard: balance, pending, daily/weekly revenue, Roblox commission, net in USD/RUB, top items, recent transactions. Uses PageCacheContext for state persistence.
- `Security.tsx` — Cookie Checker tool (bulk paste cookies, check validity, see Robux balance / Premium / friends count, copy cookies). Also: Session Monitor, Activity Logs, Auto Cookie Refresh, Proxy config. No account-switching; purely a cookie management/checking tool.

### Backend Routes
- `POST /api/license/verify` — Activate license code, bind device fingerprint, return JWT
- `POST /api/license/status` — Validate JWT + device fingerprint
- `POST /api/license/admin/create` — Admin create license (requires ADMIN_SECRET header)
- `POST /api/roblox/auth` — Validate cookie, return user profile
- `POST /api/roblox/groups` — List groups where user is owner
- `POST /api/roblox/groups/:groupId/stats` — Group statistics (members, funds, join policy)
- `GET /api/clothing/search?keyword=&subcategory=&sortType=&minPrice=&maxPrice=&creatorId=` — Search Roblox catalog clothing with filters (group filter via creatorId)
- `GET /api/clothing/group/:groupId/items?search=` — List group's clothing items with thumbnails and search filter
- `POST /api/clothing/bulk-download` — Bulk download templates (up to 50 items)
- `GET /api/clothing/:itemId/template` — Download clothing template (texture) as base64
- `POST /api/clothing/upload` — Upload PNG clothing to group + auto-release at price (CSRF, multipart)
- `GET /api/competitor/analyze/:groupId` — Analyze competitor group (members, clothing paginated up to 10 pages with thumbnails, top items)
- `POST /api/assistant/chat` — AI assistant chat with SSE streaming (uses OpenAI via Replit AI Integrations). Supports image attachments via `imageBase64` field for vision analysis.
- `POST /api/assistant/generate-image` — AI image generation (gpt-image-1, b64_json response format)
- `POST /api/banshield/analyze` — Content moderation pre-check for clothing names/descriptions
- `GET /api/sniper/items?search=` — Browse/search all Roblox limited items (Rolimons data)
- `GET /api/sniper/deals` — Get undervalued/projected limited items
- `GET /api/sniper/live/:assetId` — Get live catalog price for a limited item
- `POST /api/sniper/buy` — Purchase a limited item (productId, price, sellerId, userAssetId)

- `GET /api/pnl/group/:groupId` — Group P&L: balance, revenue, transactions (up to 10 pages) with item thumbnails, top items
- `GET /api/forum/topics?category=` — List forum topics by category (suggestions/offtopic/qa)
- `GET /api/forum/topics/:topicId` — Get topic details with replies
- `POST /api/forum/topics` — Create new forum topic
- `DELETE /api/forum/topics/:topicId` — Delete own topic
- `POST /api/forum/topics/:topicId/vote` — Upvote/downvote topic
- `POST /api/forum/topics/:topicId/replies` — Reply to topic
- `POST /api/forum/topics/:topicId/replies/:replyId/answer` — Mark reply as answer (Q&A, author only)
- `GET /api/forum/leaderboard` — Top posters, helpers, and contributors
- `GET /api/forum/subscriptions` — List my group subscriptions
- `POST /api/forum/subscriptions` — Subscribe to a Roblox group
- `DELETE /api/forum/subscriptions/:subId` — Unsubscribe
- `GET /api/forum/subscriptions/check/:groupId` — Check if subscribed to a group
- `WebSocket /ws/signaling` — Voice/video call signaling server (register, call-offer, call-answer, call-reject, call-end, ice-candidate, renegotiate-offer, renegotiate-answer, track-state). 1:1 DM calls only. Server enforces sender identity (currentUserId) on all relayed messages.

### Voice/Video Calls (WebRTC) — Discord-style
- `artifacts/api-server/src/signaling.ts` — WebSocket signaling server for peer-to-peer calls. Server-side identity enforcement prevents spoofing.
- `artifacts/limited-ink/src/hooks/useVoiceCall.ts` — React hook managing WebSocket signaling + RTCPeerConnection lifecycle. Supports audio, video, and screen sharing tracks with mid-call renegotiation.
- `artifacts/limited-ink/src/components/CallOverlay.tsx` — Discord-style full-screen call overlay: incoming call modal with pulsing ring animation, active call panel with video tiles, screen share view, control bar (mute, deafen, video, screen share, end call).
- Features: video calls (camera toggle), screen sharing (getDisplayMedia), deafen (mute remote audio), proper media cleanup on call end
- Call peer metadata stored in hook state (not derived from active chat) so overlay works correctly even if user switches chats
- Auto-reconnect with unmount guard; 30s call timeout for unanswered calls
- Call duration logged as chat message on end (`[call:outgoing:MM:SS]` or `[call:missed:]`)

### Components
- `BanShield.tsx` — Pre-upload moderation check component. Analyzes clothing name/description for policy violations. Shows risk score, issues, and safe alternatives.

### State Management
- `PageCacheContext.tsx` — Global in-memory page cache (10 min TTL). Preserves data across navigation for Competitors, Sniper, P&L. Keyed by page name + group ID.
- `useSounds.ts` — Sound effects hook. `playHover`, `playClick`, `playSuccess`, `playError`, `playTabSwitch`. Respects `limitedink_notif_sound` localStorage setting. Uses Web Audio API.

## Key Technical Details

### Security
- License codes are device-bound via SHA-256 fingerprint (userAgent + screen + timezone + language)
- JWT tokens contain: licenseId, plan, deviceFingerprint, expiresAt
- Roblox cookie stored in encrypted server session (PostgreSQL-backed, 7-day TTL)
- License JWT stored in **localStorage** (key: `limitedink_token`)
- All new API routes protected by `requireLicense` middleware

### Auth Flow
1. Check localStorage for JWT → POST /api/license/status to validate
2. Check sessionStorage for Roblox cookie → POST /api/roblox/auth to validate
3. Both valid → show Dashboard
4. License missing/invalid → show Activation page
5. License valid, no Roblox session → show RobloxLogin page

### API Client
Generated via Orval from `lib/api-spec/openapi.yaml`. All endpoints use POST (including group stats). Run `pnpm --filter @workspace/api-spec run codegen` to regenerate.

### AI Integration
Uses Replit AI Integrations proxy for OpenAI. Environment variables `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` are auto-configured. Model: `gpt-5.2`, uses `max_completion_tokens` (not `max_tokens`).

### Database
PostgreSQL via Drizzle ORM. Schema in `lib/db/src/schema/`.
```sql
CREATE TABLE licenses (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,  -- 'week' | 'month' | 'lifetime'
  device_fingerprint TEXT,
  activated_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gamification_profiles (
  id SERIAL PRIMARY KEY,
  roblox_user_id BIGINT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  invoices INTEGER DEFAULT 0,
  drafts INTEGER DEFAULT 0,
  achievements_count INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_logins INTEGER DEFAULT 0,
  last_login_date TEXT,
  streak_start_date TEXT,
  visited_sections JSONB DEFAULT '[]',
  claimed_milestones JSONB DEFAULT '[]',
  unlocked_achievements JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Gamification System
- Section visit tracking in `DashboardLayout.tsx` — fires POST to `/api/gamification/visit` on every page navigation, server-side validated against whitelist
- Achievements computed dynamically from session + DB data (invoices, drafts, todos, goals, social accounts, visited sections, streak)
- **All gamification state persisted to DB** — streaks, visited sections, claimed milestones, unlocked achievements survive re-login/session expiry
- Leaderboard backed by `gamification_profiles` DB table — stores real user XP/stats, shows Roblox avatars
- XP → Level progression with 11 tiers (0→7000 XP)
- Milestones with claimable XP rewards

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (auto-provided by Replit)
- `JWT_SECRET` — JWT signing secret
- `ADMIN_SECRET` — Admin API secret
- `SESSION_SECRET` — Express session secret
- `TELEGRAM_BOT_TOKEN` — Telegram bot token for license sales
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI proxy URL (auto-configured)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI proxy key (auto-configured)

## Test Data
- Test license code: `6B202796EE22740A` (lifetime plan)
- Admin endpoint: `POST /api/license/admin/create` with body `{ "adminSecret": "limitedink-admin-secret-2024", "plan": "lifetime" }`

## Design
- Black-and-white minimal UI
- Font: system default with `font-display` class for headings
- shadcn/ui components with custom rounded styling
- Framer Motion for page transitions
- Dark mode ready (CSS variables)

## Desktop App (Electron)
- `desktop/` — Standalone Electron desktop app for Windows + MacOS
- Uses SQLite (better-sqlite3) instead of PostgreSQL
- Express server runs on localhost inside Electron main process
- Build: `cd desktop && npm install && npm run dist:win` (or `dist:mac`)
- Database stored in OS-specific userData directory
- All 25+ tables converted from PostgreSQL to SQLite dialect
- Session store: custom SQLite-based express-session store
- Telegram bot still works via internet (optional, TELEGRAM_BOT_TOKEN)
- License system preserved (JWT_SECRET auto-generated if not set)
- esbuild bundles api-server routes with @workspace/db aliased to SQLite shim

### Desktop Build (Electron)
- `desktop/` — Standalone Electron desktop app for Windows + MacOS
- License verification proxied to remote API: `REMOTE_API` in `desktop/src/server/app.ts`
- Frontend pre-built on Replit and stored in `desktop/frontend-build/`
- Build steps for user: `cd desktop && npm install && npm run dist:win` (Windows) or `npm run dist:mac` (MacOS)
- Requirements: Node.js 20 LTS, Visual Studio Build Tools (Windows)
- CRITICAL: `desktop/package.json` must NOT have `"type": "module"`
- Build scripts use `fileURLToPath(import.meta.url)` with `__dirname` fallback
- esbuild uses `nodePaths` pointing to `desktop/node_modules/` so `zod` resolves correctly
- Telegram bot in api-server only runs in production/desktop (skipped in development to avoid conflicts)

### Deployment
- API server deployed as VM (`deploymentTarget = "vm"`) for always-running Telegram bot
- Production URL: `workspace-zljs204.replit.app`
- Health check: `/api/healthz`
- Telegram bot polling conflicts resolved: bot disabled in development mode

## Known Limitations / Pending Work
- Roblox clothing upload uses `apis.roblox.com/assets/user-auth/v1/assets` (Open Cloud API) with multipart form. Price set + release via `itemconfiguration.roblox.com/v1/collectibles` with correct payload (targetId, creatorGroupId, publisherUserId, priceInRobux, agreedPublishingFee:10, publishingType:2, resaleRestriction:2, saleLocationConfiguration).
- Upload tab supports Template Overlay: user can upload a template PNG that gets composited on top of each clothing image via HTML5 Canvas (585x559 px) before upload. Also has bulk name/type/price/description settings.
- Group clothing uses ItemConfig API (`/v1/creations/get-assets`) as primary source (100 items/page, up to 5000 per type: Shirt, Pants, TShirt), with Catalog API as fallback. Both have 429 retry logic with exponential backoff.
- Rate limit mitigation: throttledFetch (350ms min gap), search cache 30min TTL, group cache 15min TTL, exponential backoff on 429, thumbnail retry on rate limit, frontend 3s search debounce.
- Sniper thumbnails use persistent `thumbnailCache` Map (30min TTL) separate from Rolimons item cache (5min TTL).
- Telegram bot for selling license codes is included but basic
- License expiry checks work via DB `expires_at` field, but UI doesn't show countdown
- Limited Sniper is a scanner/monitor only, not an autobuyer
