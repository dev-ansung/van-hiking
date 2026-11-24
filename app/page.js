"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { List, Map as MapIcon, Satellite, Search, X } from "lucide-react";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

import Header from "./header";
import { routeColor } from "./hike-map";

const HikesMap = dynamic(() => import("./hike-map"), {
  ssr: false,
  loading: () => <p className="empty">地圖載入中…</p>,
});

const API = "https://vanhiking-api.ansung.dev";
const DEFAULT_ACCOUNT = "fb-changqing";

async function getJSON(path) {
  const res = await fetch(API + path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// Estimated minutes -> "約 2 小時 37 分鐘" (estimates only, never measured).
function fmtEstMin(min) {
  if (min === null || min === undefined || min === "") return "—";
  const m = Math.round(Number(min));
  if (Number.isNaN(m)) return "—";
  if (m < 60) return `約 ${m} 分鐘`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `約 ${h} 小時` : `約 ${h} 小時 ${r} 分鐘`;
}

// ISO 8601 year + week for a YYYY-MM-DD date (UTC noon avoids TZ shifts).
function isoYearWeek(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const firstThu = new Date(jan4);
  firstThu.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
  const week = 1 + Math.round((d - firstThu) / (7 * 24 * 3600 * 1000));
  return { year, week };
}

// Searchable text for a hike: route name, meeting point, waypoint names.
function searchText(h) {
  const wps = Array.isArray(h.waypoints) ? h.waypoints : [];
  return [h.route, h.meeting_point, ...wps.map((w) => w.name || "")]
    .join(" ")
    .toLowerCase();
}

// Default view: only the last 3 months, so 202 pins never all show at once.
// "recent" is a sentinel yearFilter value alongside "all" and year numbers;
// picking a year/week overrides it, and 全部 restores the full list.
const RECENT_MONTHS = 3;
const PAGE_SIZE = 10;

function recentCutoffStr() {
  const now = new Date();
  const cut = new Date(now.getFullYear(), now.getMonth() - RECENT_MONTHS, now.getDate());
  const y = cut.getFullYear();
  const m = String(cut.getMonth() + 1).padStart(2, "0");
  const d = String(cut.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function SearchBox({ value, onChange, autoFocus }) {
  return (
    <div className="map-search">
      <Search size={18} className="map-search-icon" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜尋路線、地點、集合點…"
        aria-label="搜尋路線"
        className="map-search-input"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="清除搜尋"
          className="map-search-clear"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// The panel/sheet content, shared by the desktop fixed panel and the mobile
// bottom sheet. Defined at module level (not inside Page) so the search
// input keeps focus while typing.
function PanelContent(props) {
  const {
    showSearch,
    query,
    onQueryChange,
    years,
    weeks,
    yearFilter,
    weekFilter,
    onYearChange,
    onWeekChange,
    visible,
    rendered,
    listShown,
    onLoadMore,
    selectedVisible,
    selected,
    onSelect,
    onClearSelection,
    loading,
  } = props;

  return (
    <div className="panel-body">
      {showSearch && <SearchBox value={query} onChange={onQueryChange} />}

      <h2 className="section-title">健行紀錄</h2>
      <p className="section-sub">
        地圖只顯示每次健行的集合點；點選一個集合點，就會畫出該路線，清單也會切到那一週；再點一次或按 ✕
        回到原本的篩選。預設只顯示最近 3 個月，可用年份切換查看全部或某一年。
      </p>

      <div className="chip-group">
        <span className="chip-label">年份</span>
        <div className="chip-row">
          <Button
            size="sm"
            variant={yearFilter === "recent" ? "default" : "outline"}
            onClick={() => onYearChange("recent")}
          >
            最近 3 個月
          </Button>
          <Button
            size="sm"
            variant={yearFilter === "all" ? "default" : "outline"}
            onClick={() => onYearChange("all")}
          >
            全部
          </Button>
          {years.map((y) => (
            <Button
              key={y}
              size="sm"
              variant={yearFilter === String(y) ? "default" : "outline"}
              onClick={() => onYearChange(String(y))}
            >
              {y} 年
            </Button>
          ))}
        </div>
      </div>

      <div className="chip-group">
        <span className="chip-label">週數</span>
        <div className="chip-row">
          <Button
            size="sm"
            variant={weekFilter === "all" ? "default" : "outline"}
            onClick={() => onWeekChange("all")}
          >
            全部
          </Button>
          {weeks.map((w) => (
            <Button
              key={w}
              size="sm"
              variant={weekFilter === String(w) ? "default" : "outline"}
              onClick={() => onWeekChange(String(w))}
            >
              第 {w} 週
            </Button>
          ))}
        </div>
      </div>

      <p className="count">顯示 {visible.length} 趟健行</p>

      {selected && (
        <div className="hike-detail">
          <div className="hike-detail-head">
            <div>
              <div className="hike-detail-date">
                {selected.hike_date} · {selected.year} 年第 {selected.week} 週
              </div>
              <h3 className="hike-detail-title">{selected.route}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              aria-label="關閉路線詳細資料"
            >
              <X size={16} />
            </Button>
          </div>
          <p className="hike-meet">集合點：{selected.meeting_point || "—"}</p>
          <div className="post-stats">
            <span>
              {selected.distance_km
                ? `距離 約 ${selected.distance_km} 公里（估算）`
                : "距離 —"}
            </span>
            <span>時間 {fmtEstMin(selected.est_duration_min)}（估算）</span>
            <span>
              實際時間：
              {selected.actual_duration_min
                ? fmtEstMin(selected.actual_duration_min)
                : "待回報"}
            </span>
          </div>
          <p className="hike-note">
            {selected.estimate_note
              ? selected.estimate_note
              : "距離與時間為路線估算，非實測；實際時間待回報。"}
          </p>
          {Array.isArray(selected.post_ids) &&
          selected.post_ids.length > 0 ? (
            <div className="post-links">
              {selected.post_ids.map((pid, i) => (
                <a
                  key={pid}
                  className="post-link"
                  href={`https://www.facebook.com/775427925912036/posts/${pid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {selected.post_ids.length > 1
                    ? `在 Facebook 查看貼文 ${i + 1}`
                    : "在 Facebook 查看"}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {loading && visible.length === 0 ? (
        <p>載入中…</p>
      ) : visible.length === 0 ? (
        <p className="empty">這個時間沒有健行紀錄</p>
      ) : (
        <Timeline
          value={selectedVisible === null ? 0 : selectedVisible + 1}
          orientation="vertical"
        >
          {rendered.map((h, i) => (
            <TimelineItem
              key={h.id || h.hike_date}
              step={i + 1}
              data-selected-hike={
                i === selectedVisible ? h.id || h.hike_date : undefined
              }
              onClick={() => onSelect(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(i);
              }}
              role="button"
              tabIndex={0}
              className="hike-item"
            >
              <TimelineIndicator />
              <TimelineSeparator />
              <TimelineHeader>
                <div className="post-head">
                  <span className="post-name">長青健行社</span>
                  <TimelineDate>{h.hike_date}</TimelineDate>
                </div>
                <TimelineTitle>
                  <span
                    className="route-dot"
                    style={{ background: routeColor(h._idx) }}
                  />
                  {h.route}
                </TimelineTitle>
              </TimelineHeader>
              <TimelineContent>
                <p className="hike-meet">
                  集合點：{h.meeting_point || "—"}
                </p>
                <div className="post-stats">
                  <span>
                    {h.year} 年第 {h.week} 週
                  </span>
                  <span>
                    {h.distance_km
                      ? `距離 約 ${h.distance_km} 公里（估算）`
                      : "距離 —"}
                  </span>
                  <span>時間 {fmtEstMin(h.est_duration_min)}（估算）</span>
                  <span>
                    實際時間：
                    {h.actual_duration_min
                      ? fmtEstMin(h.actual_duration_min)
                      : "待回報"}
                  </span>
                </div>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      )}

      {visible.length > listShown && (
        <Button
          variant="outline"
          className="w-full"
          onClick={onLoadMore}
        >
          載入更多（已顯示 {listShown} / 共 {visible.length} 趟）
        </Button>
      )}

      <footer>資料來源：vanhiking-api · 數據由 Facebook 官方 insights 提供</footer>
    </div>
  );
}

export default function Page() {
  const [hikes, setHikes] = useState([]);
  // Index into the FULL hikes list; null = pins only, no route drawn.
  const [selectedHike, setSelectedHike] = useState(null);
  const [yearFilter, setYearFilter] = useState("recent");
  const [weekFilter, setWeekFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [basemap, setBasemap] = useState("map");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // List pagination: 10 rendered at a time; the map is not paginated.
  const [listLimit, setListLimit] = useState(PAGE_SIZE);
  // Filter active before a pin tap narrowed the list to that hike's week;
  // restored when the pin is tapped again or the detail card is closed.
  const [savedFilter, setSavedFilter] = useState(null);

  // Cutoff date (YYYY-MM-DD) for the recent default, fixed at mount.
  const recentCutoff = useMemo(() => recentCutoffStr(), []);

  // Desktop (fixed left panel) vs mobile (bottom sheet), via matchMedia.
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  // Mobile bottom sheet: Vaul snap points — peek / half / full.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [snap, setSnap] = useState("148px");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch every hike (202 total; the API pages at limit=100).
        const all = [];
        let offset = 0;
        let total = Infinity;
        while (offset < total) {
          const page = await getJSON(
            `/hikes?account_id=${encodeURIComponent(DEFAULT_ACCOUNT)}&limit=100&offset=${offset}`
          ).catch(() => ({ hikes: [], total: 0 }));
          const rows = Array.isArray(page.hikes) ? page.hikes : [];
          all.push(...rows);
          total = typeof page.total === "number" ? page.total : rows.length;
          offset += rows.length;
          if (rows.length === 0) break;
        }
        if (!cancelled) setHikes(all);
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

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(min-width: 900px)");
    const update = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      // The sheet lives only on mobile: open at peek there, closed on desktop.
      setSheetOpen(!desktop);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Hikes annotated with their ISO year/week (computed in glue code; the API
  // stores only hike_date). _idx is the index in the full list, so pin/route
  // colors stay stable when the filter changes.
  const hikesWithMeta = useMemo(
    () => hikes.map((h, i) => ({ ...h, _idx: i, ...isoYearWeek(h.hike_date) })),
    [hikes]
  );

  const years = useMemo(
    () =>
      [...new Set(hikesWithMeta.map((h) => h.year))].sort((a, b) => b - a),
    [hikesWithMeta]
  );

  const weeks = useMemo(() => {
    const pool =
      yearFilter === "all"
        ? hikesWithMeta
        : yearFilter === "recent"
          ? hikesWithMeta.filter((h) => h.hike_date >= recentCutoff)
          : hikesWithMeta.filter((h) => h.year === Number(yearFilter));
    return [...new Set(pool.map((h) => h.week))].sort((a, b) => a - b);
  }, [hikesWithMeta, yearFilter, recentCutoff]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hikesWithMeta.filter(
      (h) =>
        (yearFilter === "all" ||
          (yearFilter === "recent"
            ? h.hike_date >= recentCutoff
            : h.year === Number(yearFilter))) &&
        (weekFilter === "all" || h.week === Number(weekFilter)) &&
        (!q || searchText(h).includes(q))
    );
  }, [hikesWithMeta, yearFilter, weekFilter, query, recentCutoff]);

  // The rendered list slice: 10 at a time, newest first (hikes arrive
  // newest-first from the API and filters preserve that order).
  const rendered = useMemo(
    () => visible.slice(0, listLimit),
    [visible, listLimit]
  );

  // Index of the selected hike inside the filtered list (null if hidden).
  const selectedVisible =
    selectedHike === null
      ? null
      : (() => {
          const i = visible.findIndex((v) => v._idx === selectedHike);
          return i < 0 ? null : i;
        })();

  const selected =
    selectedVisible === null ? null : visible[selectedVisible] || null;

  // After a pin tap narrows the list to that week, scroll the selected
  // item into view. Both panel instances (desktop panel + mobile sheet)
  // carry the data attribute; scrolling the hidden one is a no-op.
  useEffect(() => {
    if (selectedVisible === null) return;
    document.querySelectorAll("[data-selected-hike]").forEach((el) => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [selectedVisible, rendered]);

  const onYearChange = (v) => {
    setYearFilter(v);
    setWeekFilter("all");
    setSelectedHike(null);
    setSavedFilter(null);
    setListLimit(PAGE_SIZE);
  };
  const onWeekChange = (v) => {
    setWeekFilter(v);
    setSelectedHike(null);
    setSavedFilter(null);
    setListLimit(PAGE_SIZE);
  };
  const onQueryChange = (v) => {
    setQuery(v);
    setSelectedHike(null);
    setSavedFilter(null);
    setListLimit(PAGE_SIZE);
  };

  // Hide the route and restore the filter that was active before a pin tap
  // narrowed the list to that hike's week (if any).
  const clearSelection = () => {
    if (savedFilter) {
      setYearFilter(savedFilter.yearFilter);
      setWeekFilter(savedFilter.weekFilter);
      setListLimit(savedFilter.listLimit);
      setSavedFilter(null);
    }
    setSelectedHike(null);
  };

  // Tap a hike in the list to draw its route; tap it again to hide the
  // route. On mobile the sheet opens to half so the detail card is visible.
  // A hike selected from the list is expanded into the rendered list slice
  // if it sits past the current 10-at-a-time page.
  const selectHike = (visibleIdx) => {
    const fullIdx = visible[visibleIdx] ? visible[visibleIdx]._idx : null;
    if (fullIdx !== null && selectedHike === fullIdx) {
      clearSelection();
      return;
    }
    setSelectedHike(fullIdx);
    if (
      visibleIdx !== null &&
      visibleIdx !== undefined &&
      visibleIdx >= listLimit
    ) {
      setListLimit(visibleIdx + 1);
    }
    if (!isDesktop) {
      setSheetOpen(true);
      setSnap(0.5);
    }
  };

  // Tap a pin on the map: same as tapping the list entry, plus the list
  // narrows to that hike's ISO week so it never shows more than that
  // week's hikes (usually 1-2). Tapping the same pin again hides the route
  // and restores the filter from before the tap.
  const selectHikeFromMap = (visibleIdx) => {
    const h = visible[visibleIdx];
    if (!h) return;
    if (selectedHike === h._idx) {
      clearSelection();
      return;
    }
    if (!savedFilter) {
      setSavedFilter({ yearFilter, weekFilter, listLimit });
    }
    setYearFilter(String(h.year));
    setWeekFilter(String(h.week));
    setSelectedHike(h._idx);
    if (!isDesktop) {
      setSheetOpen(true);
      setSnap(0.5);
    }
  };

  const panelProps = {
    showSearch: false,
    query,
    onQueryChange,
    years,
    weeks,
    yearFilter,
    weekFilter,
    onYearChange,
    onWeekChange,
    visible,
    rendered,
    listShown: Math.min(listLimit, visible.length),
    onLoadMore: () => setListLimit((l) => l + PAGE_SIZE),
    selectedVisible,
    selected,
    onSelect: selectHike,
    onClearSelection: clearSelection,
    loading,
  };

  return (
    <div className="flex h-dvh flex-col">
      <Header active="map" />

      <main className="map-shell">
        {error && <div className="map-alert error">{error}</div>}

        <div className="map-full">
          <HikesMap
            hikes={visible}
            selectedIndex={selectedVisible}
            onSelect={selectHikeFromMap}
            basemap={basemap}
          />
        </div>

        {/* Desktop: search floats over the map top, Google Maps style. */}
        <div className="map-search-overlay">
          <SearchBox value={query} onChange={onQueryChange} />
        </div>

        {/* Map / satellite switch. Independent of the light/dark UI theme. */}
        <div className="map-basemap-toggle" role="group" aria-label="底圖切換">
          <Button
            size="sm"
            variant={basemap === "map" ? "default" : "outline"}
            onClick={() => setBasemap("map")}
            className="map-basemap-btn"
          >
            <MapIcon size={15} />
            地圖
          </Button>
          <Button
            size="sm"
            variant={basemap === "satellite" ? "default" : "outline"}
            onClick={() => setBasemap("satellite")}
            className="map-basemap-btn"
          >
            <Satellite size={15} />
            衛星
          </Button>
        </div>

        {/* Desktop: fixed left panel, always visible, never collapsible. */}
        <aside className="map-panel" aria-label="健行路線">
          <div className="map-panel-scroll">
            <PanelContent {...panelProps} />
          </div>
        </aside>

        {/* Mobile: drag-up bottom sheet (shadcn Drawer / Vaul, non-modal so
            the map stays interactive while the sheet is open). */}
        {mounted && !isDesktop && (
          <Drawer
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            modal={false}
            snapPoints={["148px", 0.5, 0.8]}
            activeSnapPoint={snap}
            setActiveSnapPoint={setSnap}
          >
            <DrawerContent>
              <DrawerTitle className="sr-only">健行路線</DrawerTitle>
              <DrawerDescription className="sr-only">
                搜尋與瀏覽歷次健行路線
              </DrawerDescription>
              <div className="map-sheet-scroll">
                <PanelContent {...panelProps} showSearch />
              </div>
            </DrawerContent>
          </Drawer>
        )}

        {/* Mobile: reopen the sheet after it was dragged down to dismiss. */}
        {mounted && !isDesktop && !sheetOpen && (
          <Button
            onClick={() => {
              setSheetOpen(true);
              setSnap("148px");
            }}
            className="map-sheet-reopen"
          >
            <List size={16} />
            路線清單
          </Button>
        )}
      </main>
    </div>
  );
}
