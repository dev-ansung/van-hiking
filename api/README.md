# vanhiking-api

Social-media data store for the vanhiking dashboard (Vancouver
Evergreen Hiking Club Facebook Page + the user's own Instagram /
Threads). Muse pulls fresh numbers via the Facebook / Instagram /
Threads CLIs and POSTs them here on a daily cron; the Vercel app
(`vanhiking`) reads the public GET endpoints. D1 (SharedDB) is the
store of record.

Four tables:
- `social_accounts` — one row per account/page, keyed by `id`
  (e.g. `fb-changqing`, `ig-devansung`, `threads-devansung`).
- `social_daily_snapshots` — one row per account per day: follower
  count, views, unique viewers, engagement (with and without clicks),
  profile visits, new/unfollowers, net followers, messaging
  conversations, published content. `details` holds the long-tail
  breakdowns (views by follower status, content by type) as JSON.
- `social_posts` — one row per post, keyed by
  (`account_id`, `platform_post_id`): caption, published time, type,
  lifetime views / engagements / reactions / shares / comments.
- `social_audience` — audience breakdown rows, keyed by
  (`account_id`, `snapshot_date`, `dimension`, `segment`):
  dimensions `age` / `gender` / `country` / `city`, `unit` is
  `percent` or `count`.

- Worker: `vanhiking-api`, live at https://vanhiking-api.ansung.dev
- Database: SharedDB D1 (`6255b8d0-18e8-42ef-b494-783df13ab0ca`), binding `DB`
- Auth: `Authorization: Bearer <GATE_PASSWORD>` (worker secret) on POST
  routes only. Fail-closed: with no secret set, all gated routes 401.
  GET routes are public — the data is the user's own public social
  numbers, the same as the Page shows publicly. The gate password
  value is never in this repo.

## Endpoints

- `GET /health` — liveness + D1 binding check
- `GET /accounts` — list accounts
- `GET /accounts/:id` — one account
- `GET /snapshots?account_id=&from=&to=&limit=&offset=` — daily
  snapshots, newest first. `limit` default 50, max 100.
- `GET /posts?account_id=&post_type=&limit=&offset=` — posts, newest
  first. `limit` default 50, max 100.
- `GET /audience?account_id=&snapshot_date=&dimension=&limit=&offset=` —
  audience rows. `limit` default 200, max 500.
- `GET /stats` — counts (accounts, snapshots, posts, audience rows),
  per-account breakdowns, last update time.
- `POST /accounts` — gated upsert by `id`. Required: `id`, `platform`.
- `DELETE /accounts/:id` — gated delete of the account row plus its
  snapshots, posts and audience rows.
- `POST /snapshots` — gated upsert by (`account_id`, `date`). Required:
  `account_id`, `date` (YYYY-MM-DD).
- `POST /snapshots/bulk` — gated upsert of up to 25 snapshots. Body is
  an array or `{snapshots: [...]}`.
- `POST /posts` — gated upsert by (`account_id`, `platform_post_id`).
  Required: `account_id`, `platform_post_id`.
- `POST /posts/bulk` — gated upsert of up to 25 posts. Body is an array
  or `{posts: [...]}`.
- `POST /audience` — gated upsert by (`account_id`, `snapshot_date`,
  `dimension`, `segment`). Required: all four.
- `POST /audience/bulk` — gated upsert of up to 25 audience rows. Body
  is an array or `{audience: [...]}`.
- `DELETE /audience/:id` — gated remove of one audience row (manual
  cleanup for a duplicate row, e.g. the same segment returned twice in
  different scripts).
- `POST /init` — gated, runs the schema (idempotent, `IF NOT EXISTS`).
- `GET /openapi.json` — OpenAPI 3 spec, generated at request time from
  the `ENDPOINTS` route table in `src/index.js`, so the docs cannot drift
  from the routes.
- `GET /docs` — Swagger UI for the spec (assets from the unpkg CDN).
- `GET /` — redirects to `/docs`.

All upserts use the COALESCE pattern from housing-api: fields the body
omits keep their stored value on update — a partial POST never wipes
data.

## Deploy

From a machine with `wrangler login` (OAuth):

```
npx wrangler deploy
npx wrangler secret put GATE_PASSWORD
```

Sandbox deploys go through the Cloudflare API directly with the stored
deploy token, because wrangler CLI cannot authenticate there (no saved
OAuth, token is surrogate-only). The project is still a standard wrangler
project. Sandbox deploys use `deploy.py` in this repo (multipart PUT
with the D1 binding in metadata — `workers_deploy.py` has no D1-binding
option, do NOT use it here or the binding is dropped). Do NOT keep the
deploy script only in /tmp — /tmp is wiped between sessions. Route
`vanhiking-api.ansung.dev/*` + proxied AAAA `100::` DNS record in the
ansung.dev zone — the route alone does NOT create the DNS record.

## Gotcha (housing-api, 2026-11-19): `return await` inside try/catch

A bare `return promise` inside `try` does NOT let the `catch` see the
rejection (the try block has already exited when the promise settles),
so a D1 error escapes as an uncaught worker exception (Cloudflare
1101). Every async handler call inside try uses `return await ...`
here, same as housing-api.

## Pull script

`pull-fb.py` fetches fresh Facebook Page account-insights + posts via
`/opt/hatch/bin/facebook-cli` and POSTs them to this API (account
`fb-changqing`, page id `775427925912036`). Written for the future
daily cron; it does not schedule itself. It reads the gate password
from the environment (`VANHIKING_GATE_PASSWORD`) — never from a file
in this repo.
