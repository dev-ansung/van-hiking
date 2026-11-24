-- vanhiking-api schema: social-media data store for the vanhiking
-- dashboard (Vancouver Evergreen Hiking Club + the user's own
-- Instagram/Threads). One row per account, one snapshot row per account
-- per day, one row per post, one audience row per (account, date,
-- dimension, segment).

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  name TEXT,
  username TEXT,
  url TEXT,
  website TEXT,
  follower_count INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_daily_snapshots (
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
);

CREATE TABLE IF NOT EXISTS social_posts (
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
);

CREATE TABLE IF NOT EXISTS social_audience (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  dimension TEXT NOT NULL,
  segment TEXT NOT NULL,
  value REAL,
  unit TEXT,
  UNIQUE(account_id, snapshot_date, dimension, segment)
);

CREATE TABLE IF NOT EXISTS social_hikes (
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
);

CREATE INDEX IF NOT EXISTS idx_hikes_account_date ON social_hikes(account_id, hike_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_account_date ON social_daily_snapshots(account_id, date);
CREATE INDEX IF NOT EXISTS idx_posts_account_published ON social_posts(account_id, published_at);
CREATE INDEX IF NOT EXISTS idx_audience_account_date ON social_audience(account_id, snapshot_date);
