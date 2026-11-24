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

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import Header from "@/components/header";
import { DEFAULT_ACCOUNT, fetchAllSnapshots, getJSON } from "@/lib/api";
import {
  buildMonthlyTrend,
  fmt,
  fmtSigned,
  groupAudienceByDimension,
  postTypeLabel,
  summarizeTrend,
} from "@/lib/insights";
import type {
  Account,
  AudienceRow,
  Post,
  Snapshot,
  StatsResponse,
} from "@/lib/types";

const SECTIONS = [
  { id: "overview", label: "數據總覽" },
  { id: "posts", label: "貼文" },
  { id: "audience", label: "受眾" },
];

function BarList({ title, rows }: { title: string; rows: AudienceRow[] }) {
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
              style={{
                display: "block",
                width: `${((Number(r.value) || 0) / max) * 100}%`,
              }}
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState(DEFAULT_ACCOUNT);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [audience, setAudience] = useState<AudienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [acc, stats] = await Promise.all([
          getJSON<{ accounts?: Account[] }>("/accounts").catch(() => ({
            accounts: [],
          })),
          getJSON<StatsResponse | null>("/stats").catch(() => null),
        ]);
        if (cancelled) return;
        const list = Array.isArray(acc.accounts) ? acc.accounts : [];
        setAccounts(list);
        if (stats && stats.lastUpdated) setLastUpdated(stats.lastUpdated);
        if (list.length > 0 && !list.some((a) => a.id === DEFAULT_ACCOUNT)) {
          setSelected(list[0].id);
        }
      } catch {
        if (!cancelled) setError("無法連到後台 API，請稍後再試。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAccount = useCallback(async (accountId: string) => {
    setLoading(true);
    setError("");
    try {
      const [snap, pst, aud] = await Promise.all([
        fetchAllSnapshots(accountId),
        getJSON<{ posts?: Post[] }>(
          `/posts?account_id=${encodeURIComponent(accountId)}&limit=50`
        ).catch(() => ({ posts: [] })),
        getJSON<{ audience?: AudienceRow[] }>(
          `/audience?account_id=${encodeURIComponent(accountId)}`
        ).catch(() => ({ audience: [] })),
      ]);
      setSnapshots(snap);
      setPosts(Array.isArray(pst.posts) ? pst.posts : []);
      setAudience(Array.isArray(aud.audience) ? aud.audience : []);
    } catch {
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
    const sorted = [...snapshots].sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
    return sorted[sorted.length - 1];
  }, [snapshots]);

  const trend = useMemo(() => buildMonthlyTrend(snapshots), [snapshots]);

  const trendSummary = useMemo(() => summarizeTrend(trend), [trend]);

  const topPosts = useMemo(() => {
    return [...posts].sort(
      (a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)
    );
  }, [posts]);

  const audByDim = useMemo(
    () => groupAudienceByDimension(audience),
    [audience]
  );

  const selectedAccount = accounts.find((a) => a.id === selected);
  const tabs: Account[] =
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
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {accounts.length > 1 && (
            <Tabs value={selected} onValueChange={setSelected}>
              <TabsList>
                {tabs.map((a) => (
                  <TabsTrigger key={a.id} value={a.id}>
                    {a.name || a.id}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {loading && snapshots.length === 0 && posts.length === 0 ? (
            <div className="flex flex-col gap-4">
              <div className="kpis">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
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
                  <Card size="sm">
                    <CardHeader>
                      <CardDescription>追蹤數</CardDescription>
                      <CardTitle className="text-2xl font-bold">
                        {latest ? fmt(latest.follower_count) : "尚無數據"}
                      </CardTitle>
                    </CardHeader>
                    {latest && (
                      <CardContent className="text-xs text-muted-foreground">
                        {latest.date}
                      </CardContent>
                    )}
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardDescription>瀏覽</CardDescription>
                      <CardTitle className="text-2xl font-bold">
                        {latest ? fmt(latest.views) : "尚無數據"}
                      </CardTitle>
                    </CardHeader>
                    {latest && (
                      <CardContent className="text-xs text-muted-foreground">
                        近 28 天
                      </CardContent>
                    )}
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardDescription>互動（含點擊）</CardDescription>
                      <CardTitle className="text-2xl font-bold">
                        {latest
                          ? fmt(latest.engagement_including_clicks)
                          : "尚無數據"}
                      </CardTitle>
                    </CardHeader>
                    {latest && (
                      <CardContent className="text-xs text-muted-foreground">
                        近 28 天
                      </CardContent>
                    )}
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardDescription>新追蹤</CardDescription>
                      <CardTitle className="text-2xl font-bold">
                        {latest ? fmtSigned(latest.new_followers) : "尚無數據"}
                      </CardTitle>
                    </CardHeader>
                    {latest && (
                      <CardContent className="text-xs text-muted-foreground">
                        近 28 天
                      </CardContent>
                    )}
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardDescription>淨追蹤</CardDescription>
                      <CardTitle className="text-2xl font-bold">
                        {latest ? fmtSigned(latest.net_followers) : "尚無數據"}
                      </CardTitle>
                    </CardHeader>
                    {latest && (
                      <CardContent className="text-xs text-muted-foreground">
                        近 28 天
                      </CardContent>
                    )}
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardDescription>個人檔案瀏覽</CardDescription>
                      <CardTitle className="text-2xl font-bold">
                        {latest ? fmt(latest.profile_visits) : "尚無數據"}
                      </CardTitle>
                    </CardHeader>
                    {latest && (
                      <CardContent className="text-xs text-muted-foreground">
                        近 28 天
                      </CardContent>
                    )}
                  </Card>
                </section>

                <Card>
                  <CardHeader>
                    <CardTitle>每月觸及趨勢</CardTitle>
                    <CardDescription>
                      Facebook 每日 insights，按月彙總（2019 年 1 月 – 2026 年 11
                      月）；觸及數據自 2024 年 8 月起才有記錄，之前顯示為空白；2026
                      年 11 月僅含 11 月 1–20 日，2026-11-21 的 28 天彙總已排除
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {trend.length === 0 ? (
                      <Empty className="border-none py-6">
                        <EmptyHeader>
                          <EmptyTitle>尚無數據</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <>
                        <div className="h-[300px] w-full text-foreground">
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
                                  if (value === null || value === undefined)
                                    return "—";
                                  return name === "互動率"
                                    ? `${value}%`
                                    : fmt(value as number);
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
                          <div className="kpis mt-4">
                            <Card size="sm">
                              <CardHeader>
                                <CardDescription>平均每月觸及</CardDescription>
                                <CardTitle className="text-2xl font-bold">
                                  {fmt(trendSummary.avgMonthlyViews)}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="text-xs text-muted-foreground">
                                有記錄的 {trendSummary.monthsWithData} 個月平均
                              </CardContent>
                            </Card>
                            <Card size="sm">
                              <CardHeader>
                                <CardDescription>表現最好的月份</CardDescription>
                                <CardTitle className="text-2xl font-bold">
                                  {fmt(trendSummary.best.views)}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="text-xs text-muted-foreground">
                                {trendSummary.best.month}
                              </CardContent>
                            </Card>
                            <Card size="sm">
                              <CardHeader>
                                <CardDescription>粉絲成長</CardDescription>
                                <CardTitle className="text-2xl font-bold">
                                  {trendSummary.followerGrowth === null
                                    ? "—"
                                    : fmtSigned(trendSummary.followerGrowth)}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="text-xs text-muted-foreground">
                                {trendSummary.firstFollowers !== null &&
                                trendSummary.lastFollowers !== null
                                  ? `${fmt(trendSummary.firstFollowers)} → ${fmt(trendSummary.lastFollowers)}（2019-01 → 2026-11）`
                                  : "—"}
                              </CardContent>
                            </Card>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </section>

              <section id="posts" className="flex flex-col gap-3">
                <h2 className="section-title">貼文</h2>
                {topPosts.length === 0 ? (
                  <Empty className="border-none py-6">
                    <EmptyHeader>
                      <EmptyTitle>尚無數據</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  topPosts.map((p, i) => (
                    <Card key={p.platform_post_id || i} size="sm">
                      <CardHeader>
                        <CardTitle>長青健行社</CardTitle>
                        <CardDescription>
                          {p.published_at
                            ? String(p.published_at).slice(0, 10)
                            : "—"}
                        </CardDescription>
                        <CardAction>
                          <Badge variant="secondary">
                            {postTypeLabel(p.post_type)}
                          </Badge>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2.5">
                        {p.caption ? (
                          <p className="whitespace-pre-line text-sm text-foreground">
                            {p.caption}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">瀏覽 {fmt(p.views)}</Badge>
                          <Badge variant="outline">
                            互動 {fmt(p.engagements)}
                          </Badge>
                          <Badge variant="outline">
                            讚 {fmt(p.reactions)}
                          </Badge>
                          <Badge variant="outline">
                            留言 {fmt(p.comment_count)}
                          </Badge>
                          <Badge variant="outline">
                            分享 {fmt(p.shares)}
                          </Badge>
                        </div>
                      </CardContent>
                      {p.platform_post_id ? (
                        <CardFooter>
                          <Button
                            variant="link"
                            size="sm"
                            asChild
                            className="px-0"
                          >
                            <a
                              href={`https://www.facebook.com/775427925912036/posts/${p.platform_post_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              在 Facebook 查看
                            </a>
                          </Button>
                        </CardFooter>
                      ) : null}
                    </Card>
                  ))
                )}
              </section>

              <section id="audience">
                <Card>
                  <CardHeader>
                    <CardTitle>受眾分佈</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {audience.length === 0 ? (
                      <Empty className="border-none py-6">
                        <EmptyHeader>
                          <EmptyTitle>尚無數據</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <div className="aud-grid">
                        <BarList title="年齡" rows={audByDim.age} />
                        <BarList title="性別" rows={audByDim.gender} />
                        <BarList
                          title="國家／地區（前 10）"
                          rows={audByDim.country}
                        />
                        <BarList title="城市（前 10）" rows={audByDim.city} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            </>
          )}

          <footer>資料來源：vanhiking-api · 數據由 Facebook 官方 insights 提供</footer>
        </main>
      </div>
    </>
  );
}
