import type { Hike, Snapshot } from "./types.ts";

export const API_BASE = "https://vanhiking-api.ansung.dev";
export const DEFAULT_ACCOUNT = "fb-changqing";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Fetch JSON from the vanhiking-api Worker.
 */
export async function getJSON<T = unknown>(
  path: string,
  fetchImpl: FetchLike = fetch
): Promise<T> {
  const res = await fetchImpl(API_BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()) as T;
}

interface HikesPage {
  hikes?: Hike[];
  total?: number;
}

/**
 * Paginate GET /hikes with limit=100 until total is reached.
 */
export async function fetchAllHikes(
  accountId: string = DEFAULT_ACCOUNT,
  fetchImpl: FetchLike = fetch
): Promise<Hike[]> {
  const all: Hike[] = [];
  let offset = 0;
  for (;;) {
    const page = await getJSON<HikesPage>(
      `/hikes?account_id=${encodeURIComponent(accountId)}&limit=100&offset=${offset}`,
      fetchImpl
    );
    const rows = Array.isArray(page.hikes) ? page.hikes : [];
    all.push(...rows);
    const total = Number(page.total) || 0;
    if (rows.length === 0 || all.length >= total) break;
    offset += rows.length;
  }
  return all;
}

interface SnapshotsPage {
  snapshots?: Snapshot[];
  total?: number;
}

/**
 * Paginate GET /snapshots with limit=100 until total is reached.
 * Note: includes the 2026-11-21 LAST_28D aggregate row, which buildMonthlyTrend excludes.
 */
export async function fetchAllSnapshots(
  accountId: string = DEFAULT_ACCOUNT,
  fetchImpl: FetchLike = fetch
): Promise<Snapshot[]> {
  const all: Snapshot[] = [];
  let offset = 0;
  for (;;) {
    const page = await getJSON<SnapshotsPage>(
      `/snapshots?account_id=${encodeURIComponent(accountId)}&limit=100&offset=${offset}`,
      fetchImpl
    ).catch((): SnapshotsPage => ({ snapshots: [], total: 0 }));
    const rows = Array.isArray(page.snapshots) ? page.snapshots : [];
    all.push(...rows);
    const total = Number(page.total) || 0;
    if (rows.length === 0 || all.length >= total) break;
    offset += rows.length;
  }
  return all;
}
