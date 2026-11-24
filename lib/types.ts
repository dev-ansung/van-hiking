export interface Waypoint {
  name?: string;
  lat: number;
  lng: number;
  label?: string;
}

export interface Hike {
  id?: number;
  account_id?: string;
  hike_date: string;
  route: string;
  meeting_point?: string | null;
  planned_duration_min?: number | null;
  actual_duration_min?: number | null;
  distance_km?: number | null;
  est_duration_min?: number | null;
  post_ids?: string[];
  waypoints?: Waypoint[];
  geometry?: GeoJSON.LineString | GeoJSON.MultiLineString | null;
  source?: string | null;
  estimate_note?: string | null;
}

export interface HikeWithMeta extends Hike {
  _idx: number;
  year: number;
  week: number;
}

export type PostType = "photo" | "video" | "reel" | string | null;

export interface Post {
  id?: number;
  account_id?: string;
  platform_post_id: string;
  caption?: string | null;
  published_at?: string | null;
  post_type?: PostType;
  views?: number | null;
  engagements?: number | null;
  reactions?: number | null;
  shares?: number | null;
  comment_count?: number | null;
}

export interface Account {
  id: string;
  platform?: string;
  name?: string | null;
  username?: string | null;
  url?: string | null;
  website?: string | null;
  follower_count?: number | null;
}

export interface Snapshot {
  id?: number;
  account_id?: string;
  date: string;
  follower_count?: number | null;
  views?: number | string | null;
  unique_viewers?: number | null;
  engagement?: number | null;
  engagement_including_clicks?: number | string | null;
  profile_visits?: number | null;
  new_followers?: number | null;
  unfollowers?: number | null;
  net_followers?: number | null;
}

export interface AudienceRow {
  id?: number;
  account_id?: string;
  snapshot_date?: string;
  dimension: "age" | "gender" | "country" | "city" | string;
  segment: string;
  value: number | null;
  unit?: "percent" | "count" | string | null;
}

export interface MonthlyTrendPoint {
  month: string;
  views: number | null;
  engagements: number | null;
  engagementRate: number | null;
  followers: number | null;
}

export interface TrendSummary {
  avgMonthlyViews: number;
  monthsWithData: number;
  best: MonthlyTrendPoint;
  followerGrowth: number | null;
  firstFollowers: number | null;
  lastFollowers: number | null;
}

export interface StatsResponse {
  lastUpdated?: string;
}
