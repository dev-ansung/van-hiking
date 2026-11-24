import type { Hike, HikeWithMeta, PostType } from "./types.ts";

export const RECENT_MONTHS = 3;
export const PAGE_SIZE = 10;

/**
 * Format estimated minutes into Traditional Chinese duration text.
 */
export function fmtEstMin(min: number | string | null | undefined): string {
  if (min === null || min === undefined || min === "") return "—";
  const m = Math.round(Number(min));
  if (Number.isNaN(m)) return "—";
  if (m < 60) return `約 ${m} 分鐘`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `約 ${h} 小時` : `約 ${h} 小時 ${r} 分鐘`;
}

/**
 * Compute ISO 8601 year and week for a YYYY-MM-DD date string (UTC noon avoids TZ shifts).
 */
export function isoYearWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const firstThu = new Date(jan4);
  firstThu.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
  const week =
    1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 24 * 3600 * 1000));
  return { year, week };
}

/**
 * Build lowercase searchable text for a hike from route, meeting point, and waypoints.
 */
export function searchText(h: Hike): string {
  const wps = Array.isArray(h.waypoints) ? h.waypoints : [];
  return [h.route, h.meeting_point, ...wps.map((w) => w.name || "")]
    .join(" ")
    .toLowerCase();
}

/**
 * Compute YYYY-MM-DD cutoff string for the default recent-months window.
 */
export function recentCutoffStr(
  now: Date = new Date(),
  months: number = RECENT_MONTHS
): string {
  const cut = new Date(
    now.getFullYear(),
    now.getMonth() - months,
    now.getDate()
  );
  const y = cut.getFullYear();
  const m = String(cut.getMonth() + 1).padStart(2, "0");
  const d = String(cut.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolve Facebook link label from cached post_type ("photo" | "video" | null).
 */
export function postLinkLabel(
  type: PostType | undefined,
  index: number,
  total: number
): string {
  if (type === "photo") return "在 Facebook 查看照片";
  if (type === "video") return "在 Facebook 查看影片";
  return total > 1 ? `在 Facebook 查看貼文 ${index + 1}` : "在 Facebook 查看";
}

export interface HikeFilterOptions {
  yearFilter: string;
  weekFilter: string;
  query: string;
  cutoff: string;
}

/**
 * Filter hikes by yearFilter ("recent" | "all" | year), weekFilter, and search query.
 */
export function filterHikes(
  hikesWithMeta: HikeWithMeta[],
  { yearFilter, weekFilter, query, cutoff }: HikeFilterOptions
): HikeWithMeta[] {
  const q = (query || "").trim().toLowerCase();
  return hikesWithMeta.filter(
    (h) =>
      (yearFilter === "all" ||
        (yearFilter === "recent"
          ? h.hike_date >= cutoff
          : h.year === Number(yearFilter))) &&
      (weekFilter === "all" || h.week === Number(weekFilter)) &&
      (!q || searchText(h).includes(q))
  );
}
