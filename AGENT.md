# AGENT.md — vanhiking Maintainer Guide

This document is for the Claude agent taking over maintenance of this repo. **Read it fully before changing anything.** Where anything here conflicts with the user's decisions, the user's decisions win; when in doubt, ask him first — do not change a decision on your own.

## Project overview

- Site: https://vanhiking.vercel.app (map site for the Evergreen Hiking Club / 長青健行社, a Chinese-speaking hiking club in Vancouver)
- Dashboard: https://vanhiking.vercel.app/dashboard
- Content: 202 hikes already walked (2019 to present, ~992 km total), each linked to the photos / video posted on the club's Facebook Page that day.
- **This repo is the whole project: the frontend plus the backend worker.** The API worker source lives in `api/` in this repo (Cloudflare Worker `vanhiking-api`).
- Maintainer: An Sung. The user (his parents) operates the Claude agent; they will ask you to keep updating and maintaining this repo.

## Backend (in `api/` — the frontend depends on it)

- API: https://vanhiking-api.ansung.dev — Cloudflare Worker `vanhiking-api`, database is the shared D1 `SharedDB`.
- GETs are public; POSTs require a Bearer gate password (stored as a worker secret — **never write it into the repo, into any file, or into chat**).
- Main endpoints:
  - `GET /hikes` — hike routes (fields include `post_ids`, `meeting_point`, `geometry`, `distance_km`, `est_duration_min`)
  - `GET /posts` — Facebook posts
  - `GET /posts/:id` — a single post (includes `post_type`, used by the frontend to label the photo / video links)
  - `GET /snapshots` — daily insights snapshots
  - `GET /audience` — audience data
  - `GET /stats` — totals
- Tables: `social_accounts`, `social_daily_snapshots`, `social_posts`, `social_audience`, `social_hikes`.
- Facebook Page: 長青健行社, page_id `775427925912036`, https://www.facebook.com/VancouverEvergreenHiking, 1,894 followers.
- Post link format: `https://www.facebook.com/775427925912036/posts/{platform_post_id}`.

## Stack

- Next.js 14 App Router, React 18, Recharts, next-themes (light / dark toggle).
- Map: mapcn (a MapLibre GL wrapper, CARTO basemap; satellite uses Esri World Imagery, no key needed).
- UI: ReUI Timeline, shadcn Select, shadcn Drawer (Vaul, mobile bottom sheet).
- Key files:
  - `app/page.js` — landing map + hike detail card (including the Facebook links)
  - `app/hike-map.jsx` — map component (pins, route animation, satellite toggle)
  - `app/dashboard/page.js` — dashboard (KPIs, monthly reach trend, posts, audience)
  - `app/header.jsx` — top bar, theme toggle
  - `app/globals.css` — global styles (including `.hike-pin` and the selected `.hike-item` state)
  - `components/` — shadcn / ReUI components

## Deploy

- Frontend deploy: `python3 ~/workspace/custom-connectors/custom.legacy-vercel/bin/deploy_nextjs.py ~/workspace/vanhiking --name vanhiking`
- **Always verify on https://vanhiking.vercel.app** — deployment-specific URLs 302-redirect to Vercel SSO and cannot be used.
- Deploy body limit is 10 MB: the backfill record JSONs in `.records/` (~8 MB) must not go into a deploy; the deploy script skips dot-directories.
- Worker deploy: `python3 api/deploy.py` (run from the `api/` directory; Cloudflare API multipart PUT; the wrangler CLI cannot authenticate in this environment — do not use it).
- Before editing the worker, read the existing patterns in `api/src/index.js`: async handlers must use `return await ...` (a bare `return promise` lets errors escape `catch` — this once caused a site-wide 1101).
- Scripted calls to the worker must send a browser User-Agent (e.g. `Mozilla/5.0 ... Chrome/120.0`); otherwise Cloudflare returns 1010.

## Version control

- **There is no local git repo** — GitHub (dev-ansung/van-hiking, private) is the only versioned copy.
- To update it: `PYTHONPATH=/opt/muse/skills/custom-connector-setup/bin python3 ~/workspace/custom-connectors/custom.legacy-github/bin/commit_files.py dev-ansung/van-hiking main "<message>" <localpath:remotepath> [...]`
  (`push_repo.py`'s built-in sys.path points at a path that does not exist — the PYTHONPATH above is required; git SSH push is blocked in this environment, do not use it.)
- **Grep for secrets before every push**: the repo must not contain the gate password, a Facebook/Graph token, an API key, or any bearer value. Passwords and tokens live only in the Secure Vault / worker secrets.
- After pushing, verify via the GitHub API that the files actually landed (`GET /repos/dev-ansung/van-hiking/commits`, `GET /repos/dev-ansung/van-hiking/contents/<path>`).

## Design rules set by the user (do not reverse without his approval)

- **Glue code only**: prefer off-the-shelf packages (mapcn, ReUI, shadcn); do not hand-write complex components. **Never modify a package's internals** — if a package does not fit, swap the package.
- **Mobile-first**: users are mostly on phones.
- **Clean and professional — no large text / high contrast**: he explicitly rejected a large-text / high-contrast "senior" design.
- Reference Facebook's **layout structure** only (top bar, card feed) — never its branding or colors.
- **No collapsible sidebar**: the desktop left panel is always visible; on mobile use a draggable bottom sheet (shadcn Drawer with snap points).
- **No map clustering**: he asked for it once, then asked for it to be removed the same evening. Every hike now has its own pin; tapping a pin filters the list to that hike's ISO week and scrolls to the item, and clearing the selection restores the previous filter.
- Muted pins (unselected pins) stay faint grey — he declined a contrast bump; do not propose it again.
- By default only the **last 3 months** of hikes are shown; the list shows 10 hikes at a time, with a "load more" button for 10 more.
- Distances and times are **estimates**: routes were re-routed with Valhalla pedestrian (OSRM follows car roads — do not use it); times are distance ÷ 4 km/h and the UI labels them as estimates (估算）; actual times always show as "to be reported" (待回報）.
- Every page of data must be fetched in full: paginate `GET /hikes` with limit=100 until `total` is reached (a previous bug fetched only 50 rows — fixed, do not repeat it).

## Data rules

- **The club is CLOSED**: record only hikes that have already taken place; **never** publish or display upcoming routes.
- **Never add the user's personal Instagram / Threads accounts**: they were added once and he asked for them to be removed on the spot. This site is the club's page only.
- The dashboard trend chart is a **monthly aggregation** of daily snapshots (bars = monthly reach, line = engagement rate, right axis %), and it **excludes the 2026-11-21 LAST_28D aggregate row** (that is not a daily value); before 2024-08 there are no recorded daily reach numbers, so those months render blank — **never render them as zero**.
- The club posted nothing at all in 2021 (activities paused) — that is not missing data.

## Verification after a change

1. `npm run build` passes.
2. Home and /dashboard both return HTTP 200 on https://vanhiking.vercel.app.
3. Check in a real browser with a hard refresh (production HTML is cached with `s-maxage=31536000` — without a hard refresh you will see the old version).
4. Check: pin taps, route animation, year / week filters, search, list pagination, mobile bottom sheet, light / dark toggle, Facebook link labels (photo / video).

## Known open items (do not start these unless the user says so)

- The daily 07:00 automatic pull is not scheduled yet (`api/pull-fb.py` is written and smoke-tested; the gate password must be read from an environment variable, never written into a cron).
- The dashboard posts section shows only 50 of 368 posts (whether to paginate is his call).
- The mobile ~390px layout has not been confirmed on a real phone.
- Admin auto-posting to Facebook (text-only vs with photos) and the admin page's login method are undecided.
- The five-section nav (Home / Map / Routes / Data / Admin) is discussion only — not to be built.
- The schedule PDFs on the club's website (~60 planned outings, 2019–2020) have not been crawled; note those are *plans*, not walked records.
