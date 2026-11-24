"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Header from "../header";

const API = "https://vanhiking-api.ansung.dev";
const DEFAULT_ACCOUNT = "fb-changqing";

const SECTIONS = [
  { id: "overview", label: "數據總覽" },
  { id: "posts", label: "貼文" },
  { id: "audience", label: "受眾" },
];

function fmt(n) {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString("en-US");
}

function fmtSigned(n) {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return (num > 0 ? "+" : "") + num.toLocaleString("en-US");
}

function postTypeLabel(t) {
  if (t === "video") return "影片";
  if (t === "photo") return "相片";
  if (t === "reel") return "短片";
  return t || "—";
}

async function fetchAllSnapshots(accountId) {
  // 每日快照共 2,851 筆（2019-01-01 → 2026-11-21），必須分頁拉完；
  // 單次 limit=100。注意：2026-11-21 那筆是 facebook-cli 的 LAST_28D
  // 彙總（views 39,446），不是單日值，趨勢圖必須排除（見 monthlyTrend）。
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await getJSON(
      `/snapshots?account_id=${encodeURIComponent(accountId)}&limit=100&offset=${offset}`
    ).catch(() => ({ snapshots: [], total: 0 }));
    const rows = Array.isArray(page.snapshots) ? page.snapshots : [];
    all.push(...rows);
    const total = Number(page.total) || 0;
    if (rows.length === 0 || all.length >= total) break;
    offset += rows.length;
  }
  return all;
}

async function getJSON(path) {
  const res = await fetch(API + path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function BarList({ title, rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div>
        <h3>{title}</h3>
        <p className="empty">尚無數據</p>
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return (
    <div>
      <h3>{title}</h3>
      {rows.map((r) => (
        <div className="bar-row" key={r.segment}>
          <span className="seg">{r.segment}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ display: "block", width: `${((Number(r.value) || 0) / max) * 100}%` }}
            />
          </span>
          <span className="val">
            {r.unit === "percent" ? `${r.value}%` : fmt(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(DEFAULT_ACCOUNT);
  const [snapshots, setSnapshots] = useState([]);
  const [posts, setPosts] = useState([]);
  const [audience, setAudience] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [acc, stats] = await Promise.all([
          getJSON("/accounts").catch(() => ({ accounts: [] })),
          getJSON("/stats").catch(() => null),
        ]);
        if (cancelled) return;
        const list = Array.isArray(acc.accounts) ? acc.accounts : [];
        setAccounts(list);
        if (stats && stats.lastUpdated) setLastUpdated(stats.lastUpdated);
        if (list.length > 0 && !list.some((a) => a.id === DEFAULT_ACCOUNT)) {
          setSelected(list[0].id);
        }
      } catch (e) {
        if (!cancelled) setError("無法連到後台 API，請稍後再試。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAccount = useCallback(async (accountId) => {
    setLoading(true);
    setError("");
    try {
      const [snap, pst, aud] = await Promise.all([
        fetchAllSnapshots(accountId),
        getJSON(`/posts?account_id=${encodeURIComponent(accountId)}&limit=50`).catch(() => ({ posts: [] })),
        getJSON(`/audience?account_id=${encodeURIComponent(accountId)}`).catch(() => ({ audience: [] })),
      ]);
      setSnapshots(snap);
      setPosts(Array.isArray(pst.posts) ? pst.posts : []);
      setAudience(Array.isArray(aud.audience) ? aud.audience : []);
    } catch (e) {
      setError("無法連到後台 API，請稍後再試。");
      setSnapshots([]);
      setPosts([]);
      setAudience([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount(selected);
  }, [selected, loadAccount]);

  const latest = useMemo(() => {
    if (snapshots.length === 0) return null;
    const sorted = [...snapshots].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return sorted[sorted.length - 1];
  }, [snapshots]);

  const trend = useMemo(() => {
    // 分析師版：以「每日快照」按月彙總。柱子 = 當月觸及總和；
    // 右軸折線 = 互動率（互動含點擊 ÷ 觸及），不受貼文累積時間影響。
    // 關鍵：2026-11-21 那筆是 LAST_28D 彙總（views 39,446），不是單日值，
    // 必須排除，否則會污染 2026-11 的月總和。
    // 誠實處理缺口：Facebook 每日觸及只保留到 2024-08，之前的月份
    // views/engagement 都是 0（不是真的零觸及，是沒有記錄），所以這些月
    // 顯示為空白（null），不畫成零。
    const daily = snapshots.filter(
      (s) => s && s.date && String(s.date) !== "2026-11-21"
    );
    if (daily.length === 0) return [];
    const byMonth = new Map();
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
    // 補滿首尾之間的每一個月，缺資料的月以 null 表示（不畫零）。
    const filled = [];
    let [y, mo] = months[0].split("-").map(Number);
    const [ey, emo] = months[months.length - 1].split("-").map(Number);
    while (y < ey || (y === ey && mo <= emo)) {
      const key = `${y}-${String(mo).padStart(2, "0")}`;
      const row = byMonth.get(key);
      if (!row || (row.views === 0 && row.engagements === 0)) {
        filled.push({ month: key, views: null, engagements: null, engagementRate: null, followers: row ? row.followers : null });
      } else {
        filled.push({
          month: key,
          views: row.views,
          engagements: row.engagements,
          engagementRate:
            row.views > 0 ? Math.round((row.engagements / row.views) * 1000) / 10 : 0,
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
  }, [snapshots]);

  const trendSummary = useMemo(() => {
    if (trend.length === 0) return null;
    const withData = trend.filter((r) => r.views !== null && r.views !== undefined);
    if (withData.length === 0) return null;
    const totalViews = withData.reduce((s, r) => s + (Number(r.views) || 0), 0);
    const best = [...withData].sort((a, b) => b.views - a.views)[0];
    // 粉絲成長：系列第一個月（2019-01）月底 → 最新一個月（2026-11）月底。
    // 空白月份仍保留 followers（快照有記錄），所以用完整 trend 取首尾。
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
  }, [trend]);

  const topPosts = useMemo(() => {
    return [...posts].sort(
      (a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)
    );
  }, [posts]);

  const audByDim = useMemo(() => {
    const out = { age: [], gender: [], country: [], city: [] };
    for (const row of audience) {
      if (out[row.dimension]) out[row.dimension].push(row);
    }
    const byVal = (arr) =>
      [...arr].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    out.country = byVal(out.country).slice(0, 10);
    out.city = byVal(out.city).slice(0, 10);
    out.age = byVal(out.age);
    out.gender = byVal(out.gender);
    return out;
  }, [audience]);

  const selectedAccount = accounts.find((a) => a.id === selected);
  const tabs =
    accounts.length > 0
      ? accounts
      : [{ id: DEFAULT_ACCOUNT, name: "長青健行社", platform: "facebook" }];

  return (
    <>
      <Header active="dashboard" />

      <nav className="section-tabs" aria-label="分區">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.label}
          </a>
        ))}
      </nav>

      <div className="layout">
        <nav className="side-nav" aria-label="分區">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>

        <main className="feed">
          {error && <div className="error">{error}</div>}

          {accounts.length > 1 && (
            <div className="tabs">
              {tabs.map((a) => (
                <button
                  key={a.id}
                  className={a.id === selected ? "active" : ""}
                  onClick={() => setSelected(a.id)}
                >
                  {a.name || a.id}
                </button>
              ))}
            </div>
          )}

          {loading && snapshots.length === 0 && posts.length === 0 ? (
            <p>載入中…</p>
          ) : (
            <>
              <section id="overview">
                <h2 className="section-title">數據總覽</h2>
                <p className="section-sub">
                  {selectedAccount
                    ? `${selectedAccount.name}${selectedAccount.username ? `（${selectedAccount.username}）` : ""}`
                    : "社群數據總覽"}
                  {lastUpdated ? ` · 最後更新 ${lastUpdated}` : ""}
                </p>
                <section className="kpis">
                  <div className="kpi">
                    <div className="label">追蹤數</div>
                    <div className="value">{latest ? fmt(latest.follower_count) : "尚無數據"}</div>
                    {latest && <div className="sub">{latest.date}</div>}
                  </div>
                  <div className="kpi">
                    <div className="label">瀏覽</div>
                    <div className="value">{latest ? fmt(latest.views) : "尚無數據"}</div>
                    {latest && <div className="sub">近 28 天</div>}
                  </div>
                  <div className="kpi">
                    <div className="label">互動（含點擊）</div>
                    <div className="value">{latest ? fmt(latest.engagement_including_clicks) : "尚無數據"}</div>
                    {latest && <div className="sub">近 28 天</div>}
                  </div>
                  <div className="kpi">
                    <div className="label">新追蹤</div>
                    <div className="value">{latest ? fmtSigned(latest.new_followers) : "尚無數據"}</div>
                    {latest && <div className="sub">近 28 天</div>}
                  </div>
                  <div className="kpi">
                    <div className="label">淨追蹤</div>
                    <div className="value">{latest ? fmtSigned(latest.net_followers) : "尚無數據"}</div>
                    {latest && <div className="sub">近 28 天</div>}
                  </div>
                  <div className="kpi">
                    <div className="label">個人檔案瀏覽</div>
                    <div className="value">{latest ? fmt(latest.profile_visits) : "尚無數據"}</div>
                    {latest && <div className="sub">近 28 天</div>}
                  </div>
                </section>

                <section className="card">
                  <h2>每月觸及趨勢</h2>
                  <p className="section-sub">
                    Facebook 每日 insights，按月彙總（2019 年 1 月 – 2026 年 11
                    月）；觸及數據自 2024 年 8 月起才有記錄，之前顯示為空白；2026
                    年 11 月僅含 11 月 1–20 日，2026-11-21 的 28 天彙總已排除
                  </p>
                  {trend.length === 0 ? (
                    <p className="empty">尚無數據</p>
                  ) : (
                    <>
                      <div style={{ width: "100%", height: 300, color: "var(--foreground)" }}>
                        <ResponsiveContainer>
                          <ComposedChart
                            data={trend}
                            margin={{ top: 5, right: 16, bottom: 5, left: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 12, fill: "currentColor" }}
                              minTickGap={40}
                            />
                            <YAxis
                              yAxisId="views"
                              tick={{ fontSize: 12, fill: "currentColor" }}
                            />
                            <YAxis
                              yAxisId="rate"
                              orientation="right"
                              unit="%"
                              domain={[0, "auto"]}
                              tick={{ fontSize: 12, fill: "currentColor" }}
                            />
                            <Tooltip
                              formatter={(value, name) => {
                                if (value === null || value === undefined) return "—";
                                return name === "互動率" ? `${value}%` : fmt(value);
                              }}
                            />
                            <Legend />
                            <Bar
                              yAxisId="views"
                              dataKey="views"
                              name="每月觸及"
                              fill="#1a73e8"
                            />
                            <Line
                              yAxisId="rate"
                              type="monotone"
                              dataKey="engagementRate"
                              name="互動率"
                              stroke="#f59e0b"
                              dot={false}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      {trendSummary && (
                        <div className="kpis" style={{ marginTop: 16 }}>
                          <div className="kpi">
                            <div className="label">平均每月觸及</div>
                            <div className="value">{fmt(trendSummary.avgMonthlyViews)}</div>
                            <div className="sub">有記錄的 {trendSummary.monthsWithData} 個月平均</div>
                          </div>
                          <div className="kpi">
                            <div className="label">表現最好的月份</div>
                            <div className="value">{fmt(trendSummary.best.views)}</div>
                            <div className="sub">{trendSummary.best.month}</div>
                          </div>
                          <div className="kpi">
                            <div className="label">粉絲成長</div>
                            <div className="value">
                              {trendSummary.followerGrowth === null
                                ? "—"
                                : fmtSigned(trendSummary.followerGrowth)}
                            </div>
                            <div className="sub">
                              {trendSummary.firstFollowers !== null &&
                              trendSummary.lastFollowers !== null
                                ? `${fmt(trendSummary.firstFollowers)} → ${fmt(trendSummary.lastFollowers)}（2019-01 → 2026-11）`
                                : "—"}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </section>

              <section id="posts">
                <h2 className="section-title">貼文</h2>
                {topPosts.length === 0 ? (
                  <p className="empty">尚無數據</p>
                ) : (
                  topPosts.map((p, i) => (
                    <article key={p.platform_post_id || i} className="card post-card">
                      <div className="post-head">
                        <span className="post-name">長青健行社</span>
                        <span className="post-date">
                          {p.published_at ? String(p.published_at).slice(0, 10) : "—"}
                        </span>
                        <span className="post-type">{postTypeLabel(p.post_type)}</span>
                      </div>
                      {p.caption ? <p className="post-text">{p.caption}</p> : null}
                      <div className="post-stats">
                        <span>瀏覽 {fmt(p.views)}</span>
                        <span>互動 {fmt(p.engagements)}</span>
                        <span>讚 {fmt(p.reactions)}</span>
                        <span>留言 {fmt(p.comment_count)}</span>
                        <span>分享 {fmt(p.shares)}</span>
                      </div>
                      {p.platform_post_id ? (
                        <a
                          className="post-link"
                          href={`https://www.facebook.com/775427925912036/posts/${p.platform_post_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          在 Facebook 查看
                        </a>
                      ) : null}
                    </article>
                  ))
                )}
              </section>

              <section id="audience" className="card">
                <h2>受眾分佈</h2>
                {audience.length === 0 ? (
                  <p className="empty">尚無數據</p>
                ) : (
                  <div className="aud-grid">
                    <BarList title="年齡" rows={audByDim.age} />
                    <BarList title="性別" rows={audByDim.gender} />
                    <BarList title="國家／地區（前 10）" rows={audByDim.country} />
                    <BarList title="城市（前 10）" rows={audByDim.city} />
                  </div>
                )}
              </section>
            </>
          )}

          <footer>資料來源：vanhiking-api · 數據由 Facebook 官方 insights 提供</footer>
        </main>
      </div>
    </>
  );
}
