export const API_BASE = "https://vanhiking-api.ansung.dev";
export const DEFAULT_ACCOUNT = "fb-changqing";

/**
 * Fetch JSON from the vanhiking-api Worker.
 * @param {string} path
 * @param {typeof fetch} [fetchImpl]
 */
export async function getJSON(path, fetchImpl = fetch) {
  const res = await fetchImpl(API_BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/**
 * Paginate GET /hikes with limit=100 until total is reached.
 * @param {string} [accountId]
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAllHikes(accountId = DEFAULT_ACCOUNT, fetchImpl = fetch) {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await getJSON(
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

/**
 * Paginate GET /snapshots with limit=100 until total is reached.
 * Note: includes the 2026-11-21 LAST_28D aggregate row, which buildMonthlyTrend excludes.
 * @param {string} [accountId]
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAllSnapshots(accountId = DEFAULT_ACCOUNT, fetchImpl = fetch) {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await getJSON(
      `/snapshots?account_id=${encodeURIComponent(accountId)}&limit=100&offset=${offset}`,
      fetchImpl
    ).catch(() => ({ snapshots: [], total: 0 }));
    const rows = Array.isArray(page.snapshots) ? page.snapshots : [];
    all.push(...rows);
    const total = Number(page.total) || 0;
    if (rows.length === 0 || all.length >= total) break;
    offset += rows.length;
  }
  return all;
}
