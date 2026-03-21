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
- `DashboardLayout.tsx` — Sidebar with owner groups list, user profile, license info, Community & Settings links
- `Home.tsx` — Empty state when no group selected
- `GroupView.tsx` — 5-tab view: Overview, Copy Clothing, Catalog, Sales, Alt Accounts. Tab state persisted per group in localStorage. Download buttons on all clothing items. AI Studio removed.
- `Community.tsx` — Social hub: Feed (posts/likes/comments), Discover (find developers, view profiles/groups), Friends (requests, chat), Chat (DM conversations)
- `Settings.tsx` — Profile bio, Theme (light/dark/system), Notifications, Privacy, Data export, License info, About. Side-nav layout.

### Backend Routes
- `POST /api/license/verify` — Activate license code, bind device fingerprint, return JWT
- `POST /api/license/status` — Validate JWT + device fingerprint
- `POST /api/license/admin/create` — Admin create license (requires ADMIN_SECRET header)
- `POST /api/roblox/auth` — Validate cookie, return user profile
- `POST /api/roblox/groups` — List groups where user is owner
- `POST /api/roblox/groups/:groupId/stats` — Group statistics (members, funds, join policy)
- `POST /api/clothing/generate` — (legacy, unused) image generation endpoint
- `POST /api/clothing/upload` — Upload clothing to Roblox group (placeholder implementation)

## Key Technical Details

### Security
- License codes are device-bound via SHA-256 fingerprint (userAgent + screen + timezone + language)
- JWT tokens contain: licenseId, plan, deviceFingerprint, expiresAt
- Roblox cookie stored in **sessionStorage only** (never persisted to DB)
- License JWT stored in **localStorage** (key: `limitedink_token`)

### Auth Flow
1. Check localStorage for JWT → POST /api/license/status to validate
2. Check sessionStorage for Roblox cookie → POST /api/roblox/auth to validate
3. Both valid → show Dashboard
4. License missing/invalid → show Activation page
5. License valid, no Roblox session → show RobloxLogin page

### API Client
Generated via Orval from `lib/api-spec/openapi.yaml`. All endpoints use POST (including group stats). Run `pnpm --filter @workspace/api-spec run codegen` to regenerate.

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
- `JWT_SECRET` — `limitedink-super-secret-key-2024-change-in-production`
- `ADMIN_SECRET` — `limitedink-admin-secret-2024`
- `OPENAI_API_KEY` — (legacy, unused for generation — now using Pollinations.ai)

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
- Telegram bot for selling license codes is not included (handled externally)
- License expiry checks work via DB `expires_at` field, but UI doesn't show countdown
