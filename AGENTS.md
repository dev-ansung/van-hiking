# AGENTS.md — van-hiking Maintainer & Agent Guide

Read this file in full before modifying anything in this repository. Where anything here conflicts with explicit user instructions, the user's instructions win; when in doubt, ask first rather than reversing a settled decision.

---

## 1. Project Overview

- **Live Site**: https://vanhiking.vercel.app (map site for the Evergreen Hiking Club / 長青健行社, Vancouver)
- **Dashboard**: https://vanhiking.vercel.app/dashboard
- **API Worker**: https://vanhiking-api.ansung.dev (Swagger UI at `/docs`, OpenAPI spec at `/openapi.json`)
- **Scope**: Full-stack monorepo — Next.js 14 frontend at the repo root (`app/`, `components/`, `lib/`, `tests/`) and Cloudflare Worker backend under `api/` (`api/src/index.js`, `api/schema.sql`, `api/wrangler.toml`, `api/pull-fb.py`).
- **Maintainer**: An Sung (`dev-ansung`).

---

## 2. Backend API (`api/`)

- **Base URL**: `https://vanhiking-api.ansung.dev` (Cloudflare Worker `vanhiking-api` + D1 `SharedDB`)
- **Auth**: `GET` endpoints are public. `POST` / `DELETE` endpoints require `Authorization: Bearer <GATE_PASSWORD>` stored as a Worker secret (fail-closed) — **never write secrets, tokens, or passwords into this repository, any file, or chat**.
- **Async Error Handling**: In `api/src/index.js`, async handlers inside `try` blocks must use `return await ...` (a bare `return promise` lets D1 errors escape `catch` as uncaught Cloudflare `1101` exceptions).
- **Endpoints**:
  - `GET /hikes` — Hike routes (`post_ids`, `meeting_point`, `geometry`, `distance_km`, `est_duration_min`)
  - `GET /posts` — Facebook posts
  - `GET /posts/:id` — Single post (`post_type` is used by the frontend to label photo vs. video links)
  - `GET /snapshots` — Daily insights snapshots
  - `GET /audience` — Audience data
  - `GET /stats` — Summary totals
  - `GET /openapi.json` & `GET /docs` — OpenAPI 3 spec and Swagger UI
- **D1 Tables** (`api/schema.sql`): `social_accounts`, `social_daily_snapshots`, `social_posts`, `social_audience`, `social_hikes`
- **Facebook Page**: 長青健行社 (`page_id: 775427925912036`, https://www.facebook.com/VancouverEvergreenHiking)
- **Post URL Format**: `https://www.facebook.com/775427925912036/posts/{platform_post_id}`
- **Note on Scripted Requests**: Automated scripts calling the Worker must send a browser `User-Agent` header (e.g. `Mozilla/5.0 ... Chrome/120.0`); otherwise Cloudflare may return `1010`.

---

## 3. Tech Stack & Key Files

- **Framework**: Next.js 14 (App Router), React 18, Tailwind CSS v4, `next-themes` (light / dark toggle)
- **Charts**: Recharts
- **Map**: `mapcn` (MapLibre GL wrapper; CARTO basemap; satellite uses Esri World Imagery, no API key required)
- **UI**: ReUI Timeline, shadcn Select, shadcn Drawer (Vaul mobile bottom sheet)
- **Key Files**:
  - `app/page.js` — Landing map, filters, timeline list, hike detail card (including Facebook links)
  - `app/dashboard/page.js` — Analytics dashboard (KPIs, monthly reach trend, posts, audience)
  - `app/layout.js` — Root layout and `ThemeProvider`
  - `app/globals.css` — Global styles (including `.hike-pin` and selected `.hike-item` state)
  - `components/header.jsx` — Top navigation bar and theme toggle
  - `components/hike-map.jsx` — Map component (pins, route animation, satellite toggle)
  - `components/ui/` & `components/reui/` — Installed shadcn / ReUI / mapcn components

---

## 4. Design Rules (Do Not Reverse Without Approval)

- **Glue code only**: Prefer off-the-shelf packages (`mapcn`, ReUI, shadcn). Do not hand-write complex UI primitives, and **never modify a package's internals** — if a package does not fit, swap the package.
- **Mobile-first**: Most club members view the site on phones.
- **Clean and professional**: Do not use a large-text / high-contrast "senior" design (explicitly rejected).
- **Facebook layout reference**: Reference Facebook's layout structure only (top bar, card feed) — never its branding or colors.
- **No collapsible sidebar**: The desktop left panel is always visible; on mobile, use a draggable bottom sheet (shadcn Drawer with snap points).
- **No map clustering**: Clustering was tried and explicitly rejected. Every hike has its own pin; tapping a pin filters the list to that hike's ISO week and scrolls to the item, and clearing the selection restores the previous filter.
- **Muted pins**: Unselected pins stay faint grey — do not bump contrast.
- **Default window & pagination**: Default view shows the **last 3 months** of hikes; the list shows 10 hikes at a time with a "load more" button for 10 more.
- **Estimated distances & times**: Routes use Valhalla pedestrian routing (never OSRM, which follows car roads); durations are `distance_km / 4` km/h and labeled as estimates (`估算`); actual times always show as "to be reported" (`待回報`).
- **Full pagination**: Always paginate `GET /hikes` with `limit=100` until `total` is reached (fetching only the first page truncates older hikes).

---

## 5. Data Rules

- **The club is CLOSED**: Record only hikes that have already taken place; **never** publish or display upcoming routes.
- **Club page only**: Never add the maintainer's personal Instagram or Threads accounts.
- **Dashboard monthly trend**: Aggregates daily snapshots by month (bars = monthly reach, line = engagement rate on right axis `%`), **excluding the `2026-11-21` `LAST_28D` aggregate row**. Months before `2024-08` have no recorded daily reach and must render blank — **never render them as zero**.
- **2021 gap**: The club posted nothing in 2021 (activities paused) — this is expected, not missing data.

---

## 6. Development, Security & Verification

- **Secret hygiene**: Before every commit/push, verify no passwords, API keys, Facebook/Graph tokens, or Bearer values exist anywhere in the diff.
- **Build & verification checklist**:
  1. `npm run build` passes with zero errors.
  2. `/` and `/dashboard` both return HTTP 200 on https://vanhiking.vercel.app after deployment.
  3. Verify in a real browser with a hard refresh (production HTML is cached with `s-maxage=31536000`).
  4. Smoke-test: pin taps, route animation, year/week filters, search, list pagination, mobile bottom sheet, light/dark toggle, and Facebook photo/video link labels.

---

## 7. Known Open Items (Do Not Start Unless Asked)

- Daily 07:00 automatic pull scheduling (`pull-fb.py` in `vanhiking-api`).
- Dashboard posts pagination (currently displays 50 posts).
- Confirming ~390px mobile layout on a physical device.
- Admin auto-posting and admin login flow.
- Five-section nav (Home / Map / Routes / Data / Admin) — discussion only, do not build.
- Historical schedule PDFs (~60 planned outings from 2019–2020) — note those are *plans*, not walked records.
