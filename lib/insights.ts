import type {
  AudienceRow,
  MonthlyTrendPoint,
  PostType,
  Snapshot,
  TrendSummary,
} from "./types.ts";

export function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString("en-US");
}

export function fmtSigned(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return (num > 0 ? "+" : "") + num.toLocaleString("en-US");
}

export function postTypeLabel(t: PostType | undefined): string {
  if (t === "video") return "影片";
  if (t === "photo") return "相片";
  if (t === "reel") return "短片";
  return t || "—";
}

/**
 * Aggregate daily insights snapshots by month.
 * - Excludes the 2026-11-21 LAST_28D aggregate row.
 * - Leaves months with zero/missing daily reach (e.g. before 2024-08) as null (blank), never 0.
 */
export function buildMonthlyTrend(snapshots: Snapshot[]): MonthlyTrendPoint[] {
  const daily = snapshots.filter(
    (s) => s && s.date && String(s.date) !== "2026-11-21"
  );
  if (daily.length === 0) return [];

  const byMonth = new Map<
    string,
    {
      month: string;
      views: number;
      engagements: number;
      followers: number | null;
      lastDate: string;
    }
  >();

  for (const s of daily) {
    const month = String(s.date).slice(0, 7);
    const row = byMonth.get(month) || {
      month,
      views: 0,
      engagements: 0,
      followers: null,
      lastDate: "",
    };
    if (s.views !== null && s.views !== undefined && s.views !== "") {
      row.views += Number(s.views) || 0;
    }
    if (
      s.engagement_including_clicks !== null &&
      s.engagement_including_clicks !== undefined &&
      s.engagement_including_clicks !== ""
    ) {
      row.engagements += Number(s.engagement_including_clicks) || 0;
    }
    if (String(s.date) > row.lastDate) {
      row.lastDate = String(s.date);
      row.followers =
        s.follower_count === null || s.follower_count === undefined
          ? null
          : Number(s.follower_count);
    }
    byMonth.set(month, row);
  }

  const months = [...byMonth.keys()].sort();
  const filled: MonthlyTrendPoint[] = [];
  let [y, mo] = months[0].split("-").map(Number);
  const [ey, emo] = months[months.length - 1].split("-").map(Number);

  while (y < ey || (y === ey && mo <= emo)) {
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    const row = byMonth.get(key);
    if (!row || (row.views === 0 && row.engagements === 0)) {
      filled.push({
        month: key,
        views: null,
        engagements: null,
        engagementRate: null,
        followers: row ? row.followers : null,
      });
    } else {
      filled.push({
        month: key,
        views: row.views,
        engagements: row.engagements,
        engagementRate:
          row.views > 0
            ? Math.round((row.engagements / row.views) * 1000) / 10
            : 0,
        followers: row.followers,
      });
    }
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return filled;
}

export function summarizeTrend(
  trend: MonthlyTrendPoint[]
): TrendSummary | null {
  if (trend.length === 0) return null;
  const withData = trend.filter(
    (r) => r.views !== null && r.views !== undefined
  );
  if (withData.length === 0) return null;
  const totalViews = withData.reduce((s, r) => s + (r.views ?? 0), 0);
  const best = withData.reduce(
    (a, b) => ((b.views ?? 0) > (a.views ?? 0) ? b : a),
    withData[0]
  );
  const firstFollowers = trend[0].followers;
  const lastFollowers = trend[trend.length - 1].followers;
  return {
    avgMonthlyViews: Math.round(totalViews / withData.length),
    monthsWithData: withData.length,
    best,
    followerGrowth:
      firstFollowers !== null && lastFollowers !== null
        ? lastFollowers - firstFollowers
        : null,
    firstFollowers,
    lastFollowers,
  };
}

export interface AudienceGroups {
  age: AudienceRow[];
  gender: AudienceRow[];
  country: AudienceRow[];
  city: AudienceRow[];
}

export function groupAudienceByDimension(
  audience: AudienceRow[]
): AudienceGroups {
  const out: AudienceGroups = { age: [], gender: [], country: [], city: [] };
  for (const row of audience) {
    if (row.dimension === "age") out.age.push(row);
    else if (row.dimension === "gender") out.gender.push(row);
    else if (row.dimension === "country") out.country.push(row);
    else if (row.dimension === "city") out.city.push(row);
  }
  const byVal = (arr: AudienceRow[]) =>
    [...arr].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  out.country = byVal(out.country).slice(0, 10);
  out.city = byVal(out.city).slice(0, 10);
  out.age = byVal(out.age);
  out.gender = byVal(out.gender);
  return out;
}
