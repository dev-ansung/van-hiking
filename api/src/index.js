// vanhiking-api: social-media data store over the SharedDB D1 database.
// Four tables:
//   - `social_accounts`: one row per social account/page (FB Page, IG, Threads).
//   - `social_daily_snapshots`: one row per account per day — follower
//     count, views, engagement, new/unfollowers, published content.
//   - `social_posts`: one row per post — lifetime views/engagements/
//     reactions/shares/comments, keyed by (account_id, platform_post_id).
//   - `social_audience`: audience breakdown rows (age/gender/country/city)
//     per account per snapshot date; value is a percent or a count
//     (see `unit`).
//   - `social_hikes`: hike log entries — one row per outing (account,
//     date, route): waypoints + OSRM foot route geometry, estimated
//     distance/time (estimates, never measured) and the actual duration
//     once members report it (null = 待回報).
// A daily cron pulls fresh numbers via the Facebook/Instagram/Threads
// CLIs and POSTs them here; the Vercel dashboard (vanhiking) reads the
// public GET endpoints.
//
//   GET  /health                  liveness + D1 binding check
//   GET  /accounts                public list of accounts
//   GET  /accounts/:id            public single account
//   GET  /snapshots               public daily snapshots, filters + pagination
//   GET  /posts                   public posts, filters + pagination
//   GET  /posts/:id               public single post by platform_post_id
//   GET  /audience                public audience rows, filters + pagination
//   GET  /stats                   public counts
//   POST /accounts                gated upsert by id
//   DELETE /accounts/:id           gated delete of an account + its snapshots/posts/audience
//   POST /snapshots               gated upsert by (account_id, date)
//   POST /snapshots/bulk          gated upsert of up to 25 snapshots
//   POST /posts                   gated upsert by (account_id, platform_post_id)
//   POST /posts/bulk              gated upsert of up to 25 posts
//   POST /audience                gated upsert by (account_id, snapshot_date, dimension, segment)
//   POST /audience/bulk           gated upsert of up to 25 audience rows
//   DELETE /audience/:id           gated remove of one audience row
//   GET  /hikes                   public hike log, filters + pagination
//   POST /hikes                   gated upsert by (account_id, hike_date, route)
//   POST /hikes/bulk              gated upsert of up to 25 hikes
//   POST /init                    gated, creates tables (idempotent)
//   GET  /openapi.json            OpenAPI 3 spec, generated from ENDPOINTS below
//   GET  /docs                    Swagger UI for the spec
//   GET  /                        redirects to /docs
//
// Auth: Authorization: Bearer <GATE_PASSWORD> on POST routes.
// Fail-closed: with no secret set, all gated routes 401 — never deploy
// it open. GET routes are public: the data is the user's own public
// social numbers, the same as the Page shows publicly.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS social_accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    name TEXT,
    username TEXT,
    url TEXT,
    website TEXT,
    follower_count INTEGER,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS social_daily_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    follower_count INTEGER,
    views INTEGER,
    unique_viewers INTEGER,
    engagement INTEGER,
    engagement_including_clicks INTEGER,
    profile_visits INTEGER,
    new_followers INTEGER,
    unfollowers INTEGER,
    net_followers INTEGER,
    messaging_conversations INTEGER,
    published_content INTEGER,
    details TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(account_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    platform_post_id TEXT NOT NULL,
    caption TEXT,
    published_at TEXT,
    post_type TEXT,
    views INTEGER,
    engagements INTEGER,
    reactions INTEGER,
    shares INTEGER,
    comment_count INTEGER,
    updated_at TEXT NOT NULL,
    UNIQUE(account_id, platform_post_id)
  )`,
  `CREATE TABLE IF NOT EXISTS social_audience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    dimension TEXT NOT NULL,
    segment TEXT NOT NULL,
    value REAL,
    unit TEXT,
    UNIQUE(account_id, snapshot_date, dimension, segment)
  )`,
  `CREATE TABLE IF NOT EXISTS social_hikes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    hike_date TEXT NOT NULL,
    route TEXT,
    meeting_point TEXT,
    planned_duration_min INTEGER,
    actual_duration_min INTEGER,
    distance_km REAL,
    est_duration_min INTEGER,
    post_ids TEXT,
    waypoints TEXT,
    geometry TEXT,
    source TEXT,
    estimate_note TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(account_id, hike_date, route)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hikes_account_date ON social_hikes(account_id, hike_date)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_account_date ON social_daily_snapshots(account_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_account_published ON social_posts(account_id, published_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audience_account_date ON social_audience(account_id, snapshot_date)`,
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(obj, status = 200) {
  return Response.json(obj, { status, headers: corsHeaders() });
}

function checkAuth(request, env) {
  // Fail-closed: no secret set means no writes at all.
  if (!env.GATE_PASSWORD) return false;
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token !== "" && token === env.GATE_PASSWORD;
}

// --- coercion helpers: unknown/missing fields stay null, never crash ---
function asInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function asNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function asStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseDetails(details) {
  if (!details) return null;
  try { return JSON.parse(details); } catch { return null; }
}

// --- accounts ---------------------------------------------------------
const ACCOUNT_COLUMNS = ["id", "platform", "name", "username", "url", "website", "follower_count"];

async function upsertAccount(env, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, id: null, error: "body must be a JSON object" };
  }
  const id = asStr(body.id);
  if (!id) return { ok: false, id: null, error: "id is required" };
  if (!asStr(body.platform)) return { ok: false, id, error: "platform is required" };
  const now = new Date().toISOString();
  const cols = [...ACCOUNT_COLUMNS, "updated_at"];
  const values = cols.map((c) => {
    if (c === "updated_at") return now;
    if (c === "follower_count") return asInt(body.follower_count);
    if (c === "id" || c === "platform") return body[c];
    return asStr(body[c]);
  });
  const updates = ACCOUNT_COLUMNS.filter((c) => c !== "id")
    .map((c) => `${c} = COALESCE(excluded.${c}, social_accounts.${c})`)
    .join(", ");
  await env.DB.prepare(
    `INSERT INTO social_accounts (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})
     ON CONFLICT(id) DO UPDATE SET ${updates}, updated_at = excluded.updated_at`,
  ).bind(...values).run();
  return { ok: true, id };
}

// --- snapshots --------------------------------------------------------
const SNAPSHOT_COLUMNS = [
  "account_id", "date", "follower_count", "views", "unique_viewers", "engagement",
  "engagement_including_clicks", "profile_visits", "new_followers", "unfollowers",
  "net_followers", "messaging_conversations", "published_content", "details",
];
const SNAPSHOT_INTS = new Set([
  "follower_count", "views", "unique_viewers", "engagement", "engagement_including_clicks",
  "profile_visits", "new_followers", "unfollowers", "net_followers",
  "messaging_conversations", "published_content",
]);

async function upsertSnapshot(env, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const accountId = asStr(body.account_id);
  const date = asStr(body.date);
  if (!accountId) return { ok: false, error: "account_id is required" };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "date is required (YYYY-MM-DD)" };
  }
  const now = new Date().toISOString();
  let details = null;
  if (body.details !== undefined && body.details !== null) {
    details = typeof body.details === "string" ? body.details : JSON.stringify(body.details);
  }
  const cols = [...SNAPSHOT_COLUMNS, "updated_at"];
  const values = cols.map((c) => {
    if (c === "updated_at") return now;
    if (c === "details") return details;
    if (SNAPSHOT_INTS.has(c)) return asInt(body[c]);
    return asStr(body[c]);
  });
  const updates = SNAPSHOT_COLUMNS.filter((c) => c !== "account_id" && c !== "date")
    .map((c) => `${c} = COALESCE(excluded.${c}, social_daily_snapshots.${c})`)
    .join(", ");
  await env.DB.prepare(
    `INSERT INTO social_daily_snapshots (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})
     ON CONFLICT(account_id, date) DO UPDATE SET ${updates}, updated_at = excluded.updated_at`,
  ).bind(...values).run();
  return { ok: true, account_id: accountId, date };
}

// --- posts ------------------------------------------------------------
const POST_COLUMNS = [
  "account_id", "platform_post_id", "caption", "published_at", "post_type",
  "views", "engagements", "reactions", "shares", "comment_count",
];
const POST_INTS = new Set(["views", "engagements", "reactions", "shares", "comment_count"]);

async function upsertPost(env, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const accountId = asStr(body.account_id);
  const postId = asStr(body.platform_post_id);
  if (!accountId) return { ok: false, error: "account_id is required" };
  if (!postId) return { ok: false, error: "platform_post_id is required" };
  const now = new Date().toISOString();
  const cols = [...POST_COLUMNS, "updated_at"];
  const values = cols.map((c) => {
    if (c === "updated_at") return now;
    if (POST_INTS.has(c)) return asInt(body[c]);
    return asStr(body[c]);
  });
  const updates = POST_COLUMNS.filter((c) => c !== "account_id" && c !== "platform_post_id")
    .map((c) => `${c} = COALESCE(excluded.${c}, social_posts.${c})`)
    .join(", ");
  await env.DB.prepare(
    `INSERT INTO social_posts (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})
     ON CONFLICT(account_id, platform_post_id) DO UPDATE SET ${updates}, updated_at = excluded.updated_at`,
  ).bind(...values).run();
  return { ok: true, account_id: accountId, platform_post_id: postId };
}

// --- audience ---------------------------------------------------------
async function upsertAudience(env, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const accountId = asStr(body.account_id);
  const snapshotDate = asStr(body.snapshot_date);
  const dimension = asStr(body.dimension);
  const segment = asStr(body.segment);
  if (!accountId) return { ok: false, error: "account_id is required" };
  if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return { ok: false, error: "snapshot_date is required (YYYY-MM-DD)" };
  }
  if (!dimension) return { ok: false, error: "dimension is required" };
  if (!segment) return { ok: false, error: "segment is required" };
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO social_audience (account_id, snapshot_date, dimension, segment, value, unit)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, snapshot_date, dimension, segment) DO UPDATE SET
       value = COALESCE(excluded.value, social_audience.value),
       unit = COALESCE(excluded.unit, social_audience.unit)`,
  ).bind(accountId, snapshotDate, dimension, segment, asNum(body.value), asStr(body.unit)).run();
  return { ok: true, account_id: accountId, snapshot_date: snapshotDate, dimension, segment };
}

// --- hikes ------------------------------------------------------------
// Hike log: one row per outing. distance_km / est_duration_min are
// OSRM foot estimates (4 km/h pace) — never measured. actual_duration_min
// stays null until members report the real time (待回報).
const HIKE_COLUMNS = [
  "account_id", "hike_date", "route", "meeting_point", "planned_duration_min",
  "actual_duration_min", "distance_km", "est_duration_min", "post_ids", "waypoints",
  "geometry", "source", "estimate_note",
];
const HIKE_INTS = new Set(["planned_duration_min", "actual_duration_min", "est_duration_min"]);

function jsonStr(v) {
  if (v === undefined || v === null) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

async function upsertHike(env, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const accountId = asStr(body.account_id);
  const hikeDate = asStr(body.hike_date);
  if (!accountId) return { ok: false, error: "account_id is required" };
  if (!hikeDate || !/^\d{4}-\d{2}-\d{2}$/.test(hikeDate)) {
    return { ok: false, error: "hike_date is required (YYYY-MM-DD)" };
  }
  const now = new Date().toISOString();
  const cols = [...HIKE_COLUMNS, "updated_at"];
  const values = cols.map((c) => {
    if (c === "updated_at") return now;
    if (c === "distance_km") return asNum(body[c]);
    if (HIKE_INTS.has(c)) return asInt(body[c]);
    if (c === "post_ids" || c === "waypoints" || c === "geometry") return jsonStr(body[c]);
    return asStr(body[c]);
  });
  const updates = HIKE_COLUMNS.filter((c) => c !== "account_id" && c !== "hike_date" && c !== "route")
    .map((c) => `${c} = COALESCE(excluded.${c}, social_hikes.${c})`)
    .join(", ");
  await env.DB.prepare(
    `INSERT INTO social_hikes (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})
     ON CONFLICT(account_id, hike_date, route) DO UPDATE SET ${updates}, updated_at = excluded.updated_at`,
  ).bind(...values).run();
  return { ok: true, account_id: accountId, hike_date: hikeDate, route: asStr(body.route) };
}

async function handleHikes(request, env) {
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  if (q.get("account_id")) { where.push("account_id = ?"); params.push(q.get("account_id")); }
  if (q.get("from")) { where.push("hike_date >= ?"); params.push(q.get("from")); }
  if (q.get("to")) { where.push("hike_date <= ?"); params.push(q.get("to")); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const { limit, offset } = pageParams(q);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM social_hikes ${whereSql}`)
    .bind(...params).first();
  const rows = await env.DB.prepare(
    `SELECT * FROM social_hikes ${whereSql} ORDER BY hike_date DESC LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all();
  return json({
    total: total ? total.c : 0,
    count: rows.results.length,
    limit,
    offset,
    hikes: rows.results.map((r) => ({
      ...r,
      post_ids: parseDetails(r.post_ids),
      waypoints: parseDetails(r.waypoints),
      geometry: parseDetails(r.geometry),
    })),
  });
}

// --- GET handlers -----------------------------------------------------
function pageParams(q, def = 50, max = 100) {
  const limit = Math.min(Math.max(asInt(q.get("limit")) || def, 1), max);
  const offset = Math.max(asInt(q.get("offset")) || 0, 0);
  return { limit, offset };
}

async function handleAccounts(env) {
  const rows = await env.DB.prepare(
    "SELECT * FROM social_accounts ORDER BY platform, id",
  ).all();
  return json({ count: rows.results.length, accounts: rows.results });
}

async function handleAccountOne(env, id) {
  const row = await env.DB.prepare("SELECT * FROM social_accounts WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  return json(row);
}

async function handleSnapshots(request, env) {
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  if (q.get("account_id")) { where.push("account_id = ?"); params.push(q.get("account_id")); }
  if (q.get("from")) { where.push("date >= ?"); params.push(q.get("from")); }
  if (q.get("to")) { where.push("date <= ?"); params.push(q.get("to")); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const { limit, offset } = pageParams(q);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM social_daily_snapshots ${whereSql}`)
    .bind(...params).first();
  const rows = await env.DB.prepare(
    `SELECT * FROM social_daily_snapshots ${whereSql} ORDER BY date DESC, account_id LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all();
  return json({
    total: total ? total.c : 0,
    count: rows.results.length,
    limit,
    offset,
    snapshots: rows.results.map((r) => ({ ...r, details: parseDetails(r.details) })),
  });
}

async function handlePosts(request, env) {
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  if (q.get("account_id")) { where.push("account_id = ?"); params.push(q.get("account_id")); }
  if (q.get("post_type")) { where.push("post_type = ?"); params.push(q.get("post_type")); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const { limit, offset } = pageParams(q);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM social_posts ${whereSql}`)
    .bind(...params).first();
  const rows = await env.DB.prepare(
    `SELECT * FROM social_posts ${whereSql} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all();
  return json({ total: total ? total.c : 0, count: rows.results.length, limit, offset, posts: rows.results });
}

// Single post by platform_post_id (e.g. the map detail card needs a post's
// type to label its Facebook link 照片/影片). Public, like the list.
async function handlePostOne(env, id) {
  const row = await env.DB.prepare("SELECT * FROM social_posts WHERE platform_post_id = ?").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  return json(row);
}

async function handleAudience(request, env) {
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  if (q.get("account_id")) { where.push("account_id = ?"); params.push(q.get("account_id")); }
  if (q.get("snapshot_date")) { where.push("snapshot_date = ?"); params.push(q.get("snapshot_date")); }
  if (q.get("dimension")) { where.push("dimension = ?"); params.push(q.get("dimension")); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const { limit, offset } = pageParams(q, 200, 500);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM social_audience ${whereSql}`)
    .bind(...params).first();
  const rows = await env.DB.prepare(
    `SELECT * FROM social_audience ${whereSql} ORDER BY snapshot_date DESC, dimension, segment LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all();
  return json({ total: total ? total.c : 0, count: rows.results.length, limit, offset, audience: rows.results });
}

async function handleStats(env) {
  const accounts = await env.DB.prepare("SELECT COUNT(*) AS c FROM social_accounts").first();
  const snapshots = await env.DB.prepare("SELECT COUNT(*) AS c FROM social_daily_snapshots").first();
  const posts = await env.DB.prepare("SELECT COUNT(*) AS c FROM social_posts").first();
  const audience = await env.DB.prepare("SELECT COUNT(*) AS c FROM social_audience").first();
  const byAccount = await env.DB.prepare(
    "SELECT account_id, COUNT(*) AS snapshots FROM social_daily_snapshots GROUP BY account_id",
  ).all();
  const postsByAccount = await env.DB.prepare(
    "SELECT account_id, COUNT(*) AS posts FROM social_posts GROUP BY account_id",
  ).all();
  const last = await env.DB.prepare("SELECT MAX(updated_at) AS last_updated FROM social_daily_snapshots").first();
  return json({
    accounts: accounts ? accounts.c : 0,
    snapshots: snapshots ? snapshots.c : 0,
    posts: posts ? posts.c : 0,
    audienceRows: audience ? audience.c : 0,
    snapshotsByAccount: Object.fromEntries(byAccount.results.map((r) => [r.account_id, r.snapshots])),
    postsByAccount: Object.fromEntries(postsByAccount.results.map((r) => [r.account_id, r.posts])),
    lastUpdated: last ? last.last_updated : null,
  });
}

// --- bulk helper ------------------------------------------------------
async function handleBulk(request, env, key, upsert, label) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const items = Array.isArray(body) ? body : body[key];
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: `body must be an array of ${label} or {${key}: [...]}` }, 400);
  }
  if (items.length > 25) return json({ error: "bulk is capped at 25 rows per call" }, 400);
  const results = [];
  for (const item of items) {
    try {
      results.push(await upsert(env, item));
    } catch (e) {
      results.push({ ok: false, error: String((e && e.message) || e) });
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  return json({ ok: failed === 0, count: results.length, failed, results });
}

// --- API docs ---------------------------------------------------------
const COMPONENT_SCHEMAS = {
  Error: { type: "object", properties: { error: { type: "string" } } },
  Account: {
    type: "object",
    properties: {
      id: { type: "string", example: "fb-changqing" },
      platform: { type: "string", example: "facebook" },
      name: { type: "string", nullable: true, example: "長青健行社" },
      username: { type: "string", nullable: true, example: "VancouverEvergreenHiking" },
      url: { type: "string", nullable: true },
      website: { type: "string", nullable: true },
      follower_count: { type: "integer", nullable: true },
      updated_at: { type: "string", format: "date-time" },
    },
    required: ["id", "platform"],
  },
  Snapshot: {
    type: "object",
    properties: {
      account_id: { type: "string" },
      date: { type: "string", format: "date" },
      follower_count: { type: "integer", nullable: true },
      views: { type: "integer", nullable: true },
      unique_viewers: { type: "integer", nullable: true },
      engagement: { type: "integer", nullable: true },
      engagement_including_clicks: { type: "integer", nullable: true },
      profile_visits: { type: "integer", nullable: true },
      new_followers: { type: "integer", nullable: true },
      unfollowers: { type: "integer", nullable: true },
      net_followers: { type: "integer", nullable: true },
      messaging_conversations: { type: "integer", nullable: true },
      published_content: { type: "integer", nullable: true },
      details: { type: "object", nullable: true, additionalProperties: true },
      updated_at: { type: "string", format: "date-time" },
    },
    required: ["account_id", "date"],
  },
  Post: {
    type: "object",
    properties: {
      account_id: { type: "string" },
      platform_post_id: { type: "string" },
      caption: { type: "string", nullable: true },
      published_at: { type: "string", format: "date-time", nullable: true },
      post_type: { type: "string", nullable: true, example: "photo" },
      views: { type: "integer", nullable: true },
      engagements: { type: "integer", nullable: true },
      reactions: { type: "integer", nullable: true },
      shares: { type: "integer", nullable: true },
      comment_count: { type: "integer", nullable: true },
      updated_at: { type: "string", format: "date-time" },
    },
    required: ["account_id", "platform_post_id"],
  },
  AudienceRow: {
    type: "object",
    properties: {
      account_id: { type: "string" },
      snapshot_date: { type: "string", format: "date" },
      dimension: { type: "string", example: "age" },
      segment: { type: "string", example: "65+" },
      value: { type: "number", nullable: true },
      unit: { type: "string", nullable: true, example: "percent" },
    },
    required: ["account_id", "snapshot_date", "dimension", "segment"],
  },
  Hike: {
    type: "object",
    properties: {
      id: { type: "integer" },
      account_id: { type: "string" },
      hike_date: { type: "string", format: "date" },
      route: { type: "string", nullable: true },
      meeting_point: { type: "string", nullable: true },
      planned_duration_min: { type: "integer", nullable: true, description: "Planned duration from the schedule (minutes)" },
      actual_duration_min: { type: "integer", nullable: true, description: "Real duration once members report it; null = 待回報" },
      distance_km: { type: "number", nullable: true, description: "OSRM foot path estimate, not measured" },
      est_duration_min: { type: "integer", nullable: true, description: "Estimate at 4 km/h, not measured" },
      post_ids: { type: "array", items: { type: "string" }, nullable: true },
      waypoints: { type: "array", items: { type: "object", additionalProperties: true }, nullable: true },
      geometry: { type: "object", additionalProperties: true, nullable: true, description: "GeoJSON LineString, OSRM foot estimate" },
      source: { type: "string", nullable: true },
      estimate_note: { type: "string", nullable: true },
      updated_at: { type: "string", format: "date-time" },
    },
    required: ["account_id", "hike_date"],
  },
  Stats: {
    type: "object",
    properties: {
      accounts: { type: "integer" },
      snapshots: { type: "integer" },
      posts: { type: "integer" },
      audienceRows: { type: "integer" },
      snapshotsByAccount: { type: "object", additionalProperties: { type: "integer" } },
      postsByAccount: { type: "object", additionalProperties: { type: "integer" } },
      lastUpdated: { type: "string", format: "date-time", nullable: true },
    },
  },
};

const ENDPOINTS = [
  {
    "method": "get",
    "path": "/health",
    "operationId": "health",
    "tags": [
      "meta"
    ],
    "summary": "Liveness + D1 binding check",
    "responses": {
      "200": {
        "description": "OK",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "service": {
                  "type": "string",
                  "example": "vanhiking-api"
                },
                "db": {
                  "type": "string",
                  "enum": [
                    "ok",
                    "error",
                    "unbound"
                  ]
                }
              }
            }
          }
        }
      }
    }
  },
  {
    "method": "get",
    "path": "/accounts",
    "operationId": "listAccounts",
    "tags": [
      "accounts"
    ],
    "summary": "List accounts",
    "responses": {
      "200": {
        "description": "Accounts",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "count": {
                  "type": "integer"
                },
                "accounts": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Account"
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  {
    "method": "get",
    "path": "/accounts/{id}",
    "operationId": "getAccount",
    "tags": [
      "accounts"
    ],
    "summary": "Get one account",
    "responses": {
      "200": {
        "description": "Account",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Account"
            }
          }
        }
      },
      "404": {
        "description": "Not found",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "parameters": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ]
  },
  {
    "method": "get",
    "path": "/snapshots",
    "operationId": "listSnapshots",
    "tags": [
      "snapshots"
    ],
    "summary": "List daily snapshots",
    "responses": {
      "200": {
        "description": "Page of snapshots",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "total": {
                  "type": "integer"
                },
                "count": {
                  "type": "integer"
                },
                "limit": {
                  "type": "integer"
                },
                "offset": {
                  "type": "integer"
                },
                "snapshots": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Snapshot"
                  }
                }
              }
            }
          }
        }
      }
    },
    "parameters": [
      {
        "name": "account_id",
        "in": "query",
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "from",
        "in": "query",
        "schema": {
          "type": "string",
          "format": "date"
        }
      },
      {
        "name": "to",
        "in": "query",
        "schema": {
          "type": "string",
          "format": "date"
        }
      },
      {
        "name": "limit",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 50,
          "maximum": 100
        }
      },
      {
        "name": "offset",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 0
        }
      }
    ]
  },
  {
    "method": "get",
    "path": "/posts",
    "operationId": "listPosts",
    "tags": [
      "posts"
    ],
    "summary": "List posts",
    "responses": {
      "200": {
        "description": "Page of posts",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "total": {
                  "type": "integer"
                },
                "count": {
                  "type": "integer"
                },
                "limit": {
                  "type": "integer"
                },
                "offset": {
                  "type": "integer"
                },
                "posts": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Post"
                  }
                }
              }
            }
          }
        }
      }
    },
    "parameters": [
      {
        "name": "account_id",
        "in": "query",
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "post_type",
        "in": "query",
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "limit",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 50,
          "maximum": 100
        }
      },
      {
        "name": "offset",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 0
        }
      }
    ]
  },
  {
    "method": "get",
    "path": "/posts/{id}",
    "operationId": "getPost",
    "tags": [
      "posts"
    ],
    "summary": "Get one post by platform_post_id",
    "responses": {
      "200": {
        "description": "Post",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Post"
            }
          }
        }
      },
      "404": {
        "description": "Not found",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "parameters": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ]
  },
  {
    "method": "get",
    "path": "/audience",
    "operationId": "listAudience",
    "tags": [
      "audience"
    ],
    "summary": "List audience rows",
    "responses": {
      "200": {
        "description": "Page of audience rows",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "total": {
                  "type": "integer"
                },
                "count": {
                  "type": "integer"
                },
                "limit": {
                  "type": "integer"
                },
                "offset": {
                  "type": "integer"
                },
                "audience": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/AudienceRow"
                  }
                }
              }
            }
          }
        }
      }
    },
    "parameters": [
      {
        "name": "account_id",
        "in": "query",
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "snapshot_date",
        "in": "query",
        "schema": {
          "type": "string",
          "format": "date"
        }
      },
      {
        "name": "dimension",
        "in": "query",
        "schema": {
          "type": "string"
        }
      },
      {
        "name": "limit",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 200,
          "maximum": 500
        }
      },
      {
        "name": "offset",
        "in": "query",
        "schema": {
          "type": "integer",
          "default": 0
        }
      }
    ]
  },
  {
    "method": "get",
    "path": "/stats",
    "operationId": "getStats",
    "tags": [
      "meta"
    ],
    "summary": "Counts",
    "responses": {
      "200": {
        "description": "Stats",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Stats"
            }
          }
        }
      }
    }
  },
  {
    "method": "post",
    "path": "/accounts",
    "operationId": "upsertAccount",
    "tags": [
      "accounts"
    ],
    "summary": "Upsert one account",
    "responses": {
      "200": {
        "description": "Upserted",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "id": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "400": {
        "description": "Validation failed",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "description": "Gated. Inserts or updates an account by id. Fields the body omits keep their stored value.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "$ref": "#/components/schemas/Account"
          }
        }
      }
    },
    "auth": true
  },
  {
    "method": "post",
    "path": "/snapshots",
    "operationId": "upsertSnapshot",
    "tags": [
      "snapshots"
    ],
    "summary": "Upsert one daily snapshot",
    "responses": {
      "200": {
        "description": "Upserted",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "account_id": {
                  "type": "string"
                },
                "date": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "400": {
        "description": "Validation failed",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "$ref": "#/components/schemas/Snapshot"
          }
        }
      }
    },
    "auth": true
  },
  {
    "method": "post",
    "path": "/snapshots/bulk",
    "operationId": "upsertSnapshotsBulk",
    "tags": [
      "snapshots"
    ],
    "summary": "Upsert up to 25 daily snapshots",
    "responses": {
      "200": {
        "description": "Per-row results",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "count": {
                  "type": "integer"
                },
                "failed": {
                  "type": "integer"
                },
                "results": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": true
                  }
                }
              }
            }
          }
        }
      },
      "400": {
        "description": "Bad body (not an array, empty, or over 25)",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "description": "Gated. Body is an array, or {snapshots: [...]}. Per-row results; one bad entry does not fail the rest.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "array",
            "maxItems": 25,
            "items": {
              "$ref": "#/components/schemas/Snapshot"
            }
          }
        }
      }
    },
    "auth": true
  },
  {
    "method": "post",
    "path": "/posts",
    "operationId": "upsertPost",
    "tags": [
      "posts"
    ],
    "summary": "Upsert one post",
    "responses": {
      "200": {
        "description": "Upserted",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "account_id": {
                  "type": "string"
                },
                "platform_post_id": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "400": {
        "description": "Validation failed",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "$ref": "#/components/schemas/Post"
          }
        }
      }
    },
    "auth": true
  },
  {
    "method": "post",
    "path": "/posts/bulk",
    "operationId": "upsertPostsBulk",
    "tags": [
      "posts"
    ],
    "summary": "Upsert up to 25 posts",
    "responses": {
      "200": {
        "description": "Per-row results",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "count": {
                  "type": "integer"
                },
                "failed": {
                  "type": "integer"
                },
                "results": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": true
                  }
                }
              }
            }
          }
        }
      },
      "400": {
        "description": "Bad body (not an array, empty, or over 25)",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "description": "Gated. Body is an array, or {posts: [...]}. Per-row results; one bad entry does not fail the rest.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "array",
            "maxItems": 25,
            "items": {
              "$ref": "#/components/schemas/Post"
            }
          }
        }
      }
    },
    "auth": true
  },
  {
    "method": "post",
    "path": "/audience",
    "operationId": "upsertAudience",
    "tags": [
      "audience"
    ],
    "summary": "Upsert one audience row",
    "responses": {
      "200": {
        "description": "Upserted",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "account_id": {
                  "type": "string"
                },
                "snapshot_date": {
                  "type": "string"
                },
                "dimension": {
                  "type": "string"
                },
                "segment": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "400": {
        "description": "Validation failed",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "$ref": "#/components/schemas/AudienceRow"
          }
        }
      }
    },
    "auth": true
  },
  {
    "method": "post",
    "path": "/audience/bulk",
    "operationId": "upsertAudienceBulk",
    "tags": [
      "audience"
    ],
    "summary": "Upsert up to 25 audience rows",
    "responses": {
      "200": {
        "description": "Per-row results",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "count": {
                  "type": "integer"
                },
                "failed": {
                  "type": "integer"
                },
                "results": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": true
                  }
                }
              }
            }
          }
        }
      },
      "400": {
        "description": "Bad body (not an array, empty, or over 25)",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "description": "Gated. Body is an array, or {audience: [...]}. Per-row results; one bad entry does not fail the rest.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "array",
            "maxItems": 25,
            "items": {
              "$ref": "#/components/schemas/AudienceRow"
            }
          }
        }
      }
    },
    "auth": true
  },
  {
    "method": "get",
    "path": "/hikes",
    "operationId": "listHikes",
    "tags": ["hikes"],
    "summary": "List hike log entries",
    "description": "Public. Hike log, newest first. distance_km / est_duration_min are OSRM foot estimates (4 km/h pace), never measured; actual_duration_min is null until members report it.",
    "parameters": [
      { "name": "account_id", "in": "query", "schema": { "type": "string" } },
      { "name": "from", "in": "query", "schema": { "type": "string", "format": "date" } },
      { "name": "to", "in": "query", "schema": { "type": "string", "format": "date" } },
      { "name": "limit", "in": "query", "schema": { "type": "integer", "default": 50, "maximum": 100 } },
      { "name": "offset", "in": "query", "schema": { "type": "integer", "default": 0 } }
    ],
    "responses": {
      "200": {
        "description": "Page of hikes",
        "content": { "application/json": { "schema": { "type": "object", "properties": {
          "total": { "type": "integer" },
          "count": { "type": "integer" },
          "limit": { "type": "integer" },
          "offset": { "type": "integer" },
          "hikes": { "type": "array", "items": { "$ref": "#/components/schemas/Hike" } }
        } } } }
      }
    }
  },
  {
    "method": "post",
    "path": "/hikes",
    "operationId": "upsertHike",
    "tags": ["hikes"],
    "summary": "Upsert one hike log entry",
    "description": "Gated. Inserts or updates a hike by (account_id, hike_date, route). Fields the body omits keep their stored value.",
    "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Hike" } } } },
    "responses": {
      "200": { "description": "Upserted", "content": { "application/json": { "schema": { "type": "object", "properties": { "ok": { "type": "boolean" }, "account_id": { "type": "string" }, "hike_date": { "type": "string" }, "route": { "type": "string", "nullable": true } } } } } },
      "400": { "description": "Validation failed", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } } },
      "401": { "description": "Missing or wrong Bearer token", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } } }
    },
    "auth": true
  },
  {
    "method": "post",
    "path": "/hikes/bulk",
    "operationId": "upsertHikesBulk",
    "tags": ["hikes"],
    "summary": "Upsert up to 25 hike log entries",
    "description": "Gated. Body is an array, or {hikes: [...]}. Per-row results; one bad entry does not fail the rest.",
    "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "array", "maxItems": 25, "items": { "$ref": "#/components/schemas/Hike" } } } } },
    "responses": {
      "200": { "description": "Per-row results", "content": { "application/json": { "schema": { "type": "object", "properties": { "ok": { "type": "boolean" }, "count": { "type": "integer" }, "failed": { "type": "integer" }, "results": { "type": "array", "items": { "type": "object", "additionalProperties": true } } } } } } },
      "400": { "description": "Bad body (not an array, empty, or over 25)", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } } },
      "401": { "description": "Missing or wrong Bearer token", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } } }
    },
    "auth": true
  },
  {
    "method": "delete",
    "path": "/audience/{id}",
    "operationId": "deleteAudienceRow",
    "tags": [
      "audience"
    ],
    "summary": "Remove one audience row",
    "responses": {
      "200": {
        "description": "Removed (or was not present)",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "id": {
                  "type": "integer"
                },
                "removed": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "description": "Gated. Manual cleanup for a duplicate audience row (e.g. the same segment returned twice in different scripts).",
    "parameters": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "integer"
        }
      }
    ],
    "auth": true
  },
  {
    "method": "delete",
    "path": "/accounts/{id}",
    "operationId": "deleteAccount",
    "tags": [
      "accounts"
    ],
    "summary": "Delete an account and its data",
    "responses": {
      "200": {
        "description": "Account and its data removed (or was not present)",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "id": {
                  "type": "string"
                },
                "removed": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "description": "Gated. Deletes the account row plus its snapshots, posts and audience rows.",
    "parameters": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    ],
    "auth": true
  },
  {
    "method": "post",
    "path": "/init",
    "operationId": "initSchema",
    "tags": [
      "meta"
    ],
    "summary": "Create the tables",
    "responses": {
      "200": {
        "description": "Tables ready",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean"
                },
                "tables": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      },
      "401": {
        "description": "Missing or wrong Bearer token",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "description": "Gated. Runs the schema (idempotent, IF NOT EXISTS). Run once after the gate password is set.",
    "auth": true
  },
  {
    "method": "get",
    "path": "/openapi.json",
    "operationId": "openapi",
    "tags": [
      "meta"
    ],
    "summary": "OpenAPI 3 spec for this API",
    "responses": {
      "200": {
        "description": "OpenAPI document",
        "content": {
          "application/json": {
            "schema": {
              "type": "object"
            }
          }
        }
      }
    }
  },
  {
    "method": "get",
    "path": "/docs",
    "operationId": "docs",
    "tags": [
      "meta"
    ],
    "summary": "Swagger UI for this API",
    "responses": {
      "200": {
        "description": "Swagger UI page",
        "content": {
          "text/html": {
            "schema": {
              "type": "string"
            }
          }
        }
      }
    }
  }
];

function buildOpenApi() {
  const paths = {};
  for (const ep of ENDPOINTS) {
    const op = {
      operationId: ep.operationId,
      tags: ep.tags,
      summary: ep.summary,
    };
    if (ep.description) op.description = ep.description;
    if (ep.parameters) op.parameters = ep.parameters;
    if (ep.requestBody) op.requestBody = ep.requestBody;
    if (ep.auth) op.security = [{ bearerAuth: [] }];
    op.responses = ep.responses;
    paths[ep.path] = paths[ep.path] || {};
    paths[ep.path][ep.method] = op;
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Vanhiking API",
      version: "1.0.0",
      description:
        "Social-media data store for the vanhiking dashboard (Vancouver Evergreen " +
        "Hiking Club). Five tables: `social_accounts`, `social_daily_snapshots`, " +
        "`social_posts`, `social_audience`, `social_hikes` (hike log: route, " +
        "waypoints, OSRM foot geometry, estimated vs actual duration). POST routes " +
        "need `Authorization: Bearer <gate password>`; GET routes are public.",
    },
    servers: [{ url: "https://vanhiking-api.ansung.dev" }],
    tags: [
      { name: "accounts", description: "Social accounts / Pages" },
      { name: "snapshots", description: "Daily per-account metric snapshots" },
      { name: "posts", description: "Per-post lifetime metrics" },
      { name: "audience", description: "Audience breakdown rows" },
      { name: "hikes", description: "Hike log entries (route + time)" },
      { name: "meta", description: "Health, schema setup, and these docs" },
    ],
    paths,
    components: {
      schemas: COMPONENT_SCHEMAS,
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
      },
    },
  };
}

const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Vanhiking API — docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
<script>
window.onload = function () {
  SwaggerUIBundle({
    url: "/openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout"
  });
};
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method === "GET" && url.pathname === "/") {
        return Response.redirect(new URL("/docs", request.url), 302);
      }
      if (request.method === "GET" && url.pathname === "/openapi.json") {
        return json(buildOpenApi());
      }
      if (request.method === "GET" && url.pathname === "/docs") {
        return new Response(DOCS_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() },
        });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        let db = "unbound";
        if (env.DB) {
          try {
            await env.DB.prepare("SELECT 1 AS ok").first();
            db = "ok";
          } catch { db = "error"; }
        }
        return json({ ok: true, service: "vanhiking-api", db });
      }
      if (request.method === "GET" && url.pathname === "/accounts") {
        return await handleAccounts(env);
      }
      const accountOne = url.pathname.match(/^\/accounts\/([\w-]+)$/);
      if (request.method === "GET" && accountOne) {
        return await handleAccountOne(env, accountOne[1]);
      }
      if (request.method === "GET" && url.pathname === "/snapshots") {
        return await handleSnapshots(request, env);
      }
      if (request.method === "GET" && url.pathname === "/posts") {
        return await handlePosts(request, env);
      }
      const postOne = url.pathname.match(/^\/posts\/([\w-]+)$/);
      if (request.method === "GET" && postOne) {
        return await handlePostOne(env, decodeURIComponent(postOne[1]));
      }
      if (request.method === "GET" && url.pathname === "/audience") {
        return await handleAudience(request, env);
      }
      if (request.method === "GET" && url.pathname === "/hikes") {
        return await handleHikes(request, env);
      }
      if (request.method === "GET" && url.pathname === "/stats") {
        return await handleStats(env);
      }
      if (request.method === "POST" && url.pathname === "/accounts") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
        const res = await upsertAccount(env, body);
        return json(res, res.ok ? 200 : 400);
      }
      if (request.method === "DELETE" && accountOne) {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        const id = decodeURIComponent(accountOne[1]);
        const results = await env.DB.batch([
          env.DB.prepare("DELETE FROM social_audience WHERE account_id = ?").bind(id),
          env.DB.prepare("DELETE FROM social_posts WHERE account_id = ?").bind(id),
          env.DB.prepare("DELETE FROM social_daily_snapshots WHERE account_id = ?").bind(id),
          env.DB.prepare("DELETE FROM social_accounts WHERE id = ?").bind(id),
        ]);
        const removed = results[3] && results[3].meta ? (results[3].meta.changes || 0) > 0 : false;
        return json({ ok: true, id, removed });
      }
      if (request.method === "POST" && url.pathname === "/snapshots") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
        const res = await upsertSnapshot(env, body);
        return json(res, res.ok ? 200 : 400);
      }
      if (request.method === "POST" && url.pathname === "/snapshots/bulk") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        return await handleBulk(request, env, "snapshots", upsertSnapshot, "snapshots");
      }
      if (request.method === "POST" && url.pathname === "/posts") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
        const res = await upsertPost(env, body);
        return json(res, res.ok ? 200 : 400);
      }
      if (request.method === "POST" && url.pathname === "/posts/bulk") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        return await handleBulk(request, env, "posts", upsertPost, "posts");
      }
      if (request.method === "POST" && url.pathname === "/audience") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
        const res = await upsertAudience(env, body);
        return json(res, res.ok ? 200 : 400);
      }
      if (request.method === "POST" && url.pathname === "/audience/bulk") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        return await handleBulk(request, env, "audience", upsertAudience, "audience rows");
      }
      if (request.method === "POST" && url.pathname === "/hikes") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
        const res = await upsertHike(env, body);
        return json(res, res.ok ? 200 : 400);
      }
      if (request.method === "POST" && url.pathname === "/hikes/bulk") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        return await handleBulk(request, env, "hikes", upsertHike, "hikes");
      }
      const audienceOne = url.pathname.match(/^\/audience\/(\d+)$/);
      if (request.method === "DELETE" && audienceOne) {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        const id = asInt(audienceOne[1]);
        const res = await env.DB.prepare("DELETE FROM social_audience WHERE id = ?").bind(id).run();
        return json({ ok: true, id, removed: (res.meta && res.meta.changes || 0) > 0 });
      }
      if (request.method === "POST" && url.pathname === "/init") {
        if (!checkAuth(request, env)) return json({ error: "unauthorized" }, 401);
        await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
        return json({ ok: true, tables: ["social_accounts", "social_daily_snapshots", "social_posts", "social_audience", "social_hikes"], migrations: [] });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};
