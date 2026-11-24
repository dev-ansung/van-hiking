import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlyTrend,
  fmt,
  fmtSigned,
  groupAudienceByDimension,
  postTypeLabel,
  summarizeTrend,
} from "../lib/insights.ts";

test("fmt and fmtSigned handle numbers and empty values", () => {
  assert.equal(fmt(null), "—");
  assert.equal(fmt(1234), "1,234");
  assert.equal(fmtSigned(42), "+42");
  assert.equal(fmtSigned(-7), "-7");
  assert.equal(fmtSigned(0), "0");
});

test("postTypeLabel maps known types", () => {
  assert.equal(postTypeLabel("video"), "影片");
  assert.equal(postTypeLabel("photo"), "相片");
  assert.equal(postTypeLabel("reel"), "短片");
  assert.equal(postTypeLabel(null), "—");
});

test("buildMonthlyTrend excludes 2026-11-21 LAST_28D row and leaves pre-2024-08 reach null", () => {
  const snapshots = [
    { date: "2024-07-15", views: 0, engagement_including_clicks: 0, follower_count: 1500 },
    { date: "2024-08-10", views: 100, engagement_including_clicks: 10, follower_count: 1510 },
    { date: "2024-08-20", views: 200, engagement_including_clicks: 20, follower_count: 1520 },
    { date: "2026-11-20", views: 50, engagement_including_clicks: 5, follower_count: 1890 },
    { date: "2026-11-21", views: 39446, engagement_including_clicks: 999, follower_count: 1894 },
  ];

  const trend = buildMonthlyTrend(snapshots);
  assert.equal(trend[0].month, "2024-07");
  assert.equal(trend[0].views, null);
  assert.equal(trend[0].followers, 1500);

  const aug = trend.find((r) => r.month === "2024-08");
  assert.equal(aug.views, 300);
  assert.equal(aug.engagements, 30);
  assert.equal(aug.engagementRate, 10);
  assert.equal(aug.followers, 1520);

  const nov = trend.find((r) => r.month === "2026-11");
  assert.equal(nov.views, 50);
  assert.equal(nov.followers, 1890);

  const summary = summarizeTrend(trend);
  assert.equal(summary.monthsWithData, 2);
  assert.equal(summary.best.month, "2024-08");
  assert.equal(summary.followerGrowth, 390);
});

test("groupAudienceByDimension sorts descending and caps country/city to top 10", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    dimension: "city",
    segment: `City ${i}`,
    value: i + 1,
  }));
  const grouped = groupAudienceByDimension(rows);
  assert.equal(grouped.city.length, 10);
  assert.equal(grouped.city[0].value, 12);
  assert.equal(grouped.city[9].value, 3);
});
