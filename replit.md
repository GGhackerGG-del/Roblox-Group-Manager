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
- `GroupView.tsx` — 6-tab view: Overview, Copy Clothing, Catalog, Sales, Alt Accounts, P&L. Tab state persisted per group in localStorage. BanShield pre-upload check on clothing items.
- `Community.tsx` — Social hub: Feed (posts/likes/comments), Discover (find developers, view profiles/groups), Friends (requests, chat), Chat (DM conversations)
- `Settings.tsx` — Profile bio, Theme (light/dark/system), Notifications, Privacy (with Cookie Security info), Data export, License info, About. Side-nav layout.
- `Assistant.tsx` — AI chat assistant for Roblox development help (Lua scripts, moderation policies, clothing strategies, Discord posts). Uses SSE streaming.
- `Competitors.tsx` — Analyze any Roblox group by ID: member count, clothing stats, top items, pricing.
- `Sniper.tsx` — Monitor Roblox limited items via Rolimons API. Browse all limiteds, find deals with value premium above RAP.
- `PnL.tsx` — Group-level Profit & Loss dashboard: balance, pending, daily/weekly revenue, Roblox commission, net in USD/RUB, top items, recent transactions.

### Backend Routes
- `POST /api/license/verify` — Activate license code, bind device fingerprint, return JWT
- `POST /api/license/status` — Validate JWT + device fingerprint
- `POST /api/license/admin/create` — Admin create license (requires ADMIN_SECRET header)
- `POST /api/roblox/auth` — Validate cookie, return user profile
- `POST /api/roblox/groups` — List groups where user is owner
- `POST /api/roblox/groups/:groupId/stats` — Group statistics (members, funds, join policy)
- `POST /api/clothing/upload` — Upload clothing to Roblox group
- `GET /api/competitor/analyze/:groupId` — Analyze competitor group (members, clothing, top items)
- `POST /api/assistant/chat` — AI assistant chat with SSE streaming (uses OpenAI via Replit AI Integrations)
- `POST /api/banshield/analyze` — Content moderation pre-check for clothing names/descriptions
- `GET /api/sniper/items` — Browse top limited items from Rolimons (5-min cache)
- `GET /api/sniper/deals` — Find limited items with value premium above RAP
- `GET /api/pnl/group/:groupId` — Group P&L: balance, revenue, transactions, top items

### Components
- `BanShield.tsx` — Pre-upload moderation check component. Analyzes clothing name/description for policy violations. Shows risk score, issues, and safe alternatives.

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
PostgreSQL via Drizzle ORM. Schema in `lib/db/src/schema/licenses.ts`.
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
```

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

## Known Limitations / Pending Work
- Roblox clothing upload endpoint is a placeholder — real Roblox multipart upload API needs to be implemented
- Telegram bot for selling license codes is included but basic
- License expiry checks work via DB `expires_at` field, but UI doesn't show countdown
- Limited Sniper is a scanner/monitor only, not an autobuyer
