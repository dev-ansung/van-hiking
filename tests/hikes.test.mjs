import test from "node:test";
import assert from "node:assert/strict";
import {
  filterHikes,
  fmtEstMin,
  isoYearWeek,
  postLinkLabel,
  recentCutoffStr,
  searchText,
} from "../lib/hikes.ts";

test("fmtEstMin formats minutes and hours as estimates", () => {
  assert.equal(fmtEstMin(null), "—");
  assert.equal(fmtEstMin(undefined), "—");
  assert.equal(fmtEstMin(""), "—");
  assert.equal(fmtEstMin("abc"), "—");
  assert.equal(fmtEstMin(45), "約 45 分鐘");
  assert.equal(fmtEstMin(120), "約 2 小時");
  assert.equal(fmtEstMin(157), "約 2 小時 37 分鐘");
});

test("isoYearWeek handles year boundaries accurately", () => {
  assert.deepEqual(isoYearWeek("2024-01-01"), { year: 2024, week: 1 });
  assert.deepEqual(isoYearWeek("2023-01-01"), { year: 2022, week: 52 });
  assert.deepEqual(isoYearWeek("2026-11-21"), { year: 2026, week: 47 });
});

test("postLinkLabel distinguishes photo, video, and fallback labels", () => {
  assert.equal(postLinkLabel("photo", 0, 1), "在 Facebook 查看照片");
  assert.equal(postLinkLabel("video", 0, 2), "在 Facebook 查看影片");
  assert.equal(postLinkLabel(null, 0, 1), "在 Facebook 查看");
  assert.equal(postLinkLabel(null, 1, 3), "在 Facebook 查看貼文 2");
});

test("recentCutoffStr subtracts months cleanly", () => {
  const d = new Date(2026, 10, 23); // 2026-11-23
  assert.equal(recentCutoffStr(d, 3), "2026-08-23");
});

test("filterHikes applies recent cutoff, year, week, and query", () => {
  const hikes = [
    {
      hike_date: "2026-11-15",
      year: 2026,
      week: 46,
      route: "Grouse Grind",
      meeting_point: "Grouse Base",
      waypoints: [{ name: "Grouse Mountain" }],
    },
    {
      hike_date: "2025-05-10",
      year: 2025,
      week: 19,
      route: "Lynn Canyon",
      meeting_point: "Suspension Bridge",
      waypoints: [],
    },
  ];

  assert.equal(searchText(hikes[0]).includes("grouse mountain"), true);

  const recent = filterHikes(hikes, {
    yearFilter: "recent",
    weekFilter: "all",
    query: "",
    cutoff: "2026-08-23",
  });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].route, "Grouse Grind");

  const all = filterHikes(hikes, {
    yearFilter: "all",
    weekFilter: "all",
    query: "lynn",
    cutoff: "2026-08-23",
  });
  assert.equal(all.length, 1);
  assert.equal(all[0].route, "Lynn Canyon");
});
