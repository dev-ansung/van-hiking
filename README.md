# van-hiking — Evergreen Hiking Club Map & Dashboard

[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18-149eca.svg)](https://react.dev/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre-GL-396cb0.svg)](https://maplibre.org/)

[繁體中文](./README.zh-TW.md)

Interactive route map and analytics dashboard for the **Evergreen Hiking Club (長青健行社)** in Vancouver — archiving every club hike since 2019 with trail geometry, meeting points, estimated distance/duration, and direct links to each outing's Facebook photos and videos.

- **Live Map**: https://vanhiking.vercel.app
- **Analytics Dashboard**: https://vanhiking.vercel.app/dashboard

---

## Features

- **Interactive Route Map**: Plots every walked hike at its meeting point; selecting a pin draws the reconstructed trail route on the map and scrolls to the corresponding hike card.
- **Basemap & Satellite Toggle**: Built on MapLibre GL (`mapcn`) with CARTO basemaps (light/dark theme aware) and Esri World Imagery satellite view.
- **Filtering & Search**: Filter by year, ISO week, or place-name search. Defaults to the last 3 months and paginates 10 hikes at a time.
- **Facebook Post Integration**: Automatically resolves each hike's `post_ids` via `GET /posts/:id` to label and link directly to the day's Facebook photo album or video post.
- **Mobile-First Layout**: Fixed left panel on desktop; draggable Vaul bottom sheet with snap points on mobile.
- **Club Insights Dashboard (`/dashboard`)**: Monthly reach & engagement-rate trend chart (Recharts), post performance feed, and audience demographics.

---

## Architecture

This repository contains the **Next.js 14 frontend** only. Data is served by a separate Cloudflare Worker (`vanhiking-api`) backed by Cloudflare D1 (`SharedDB`).

```mermaid
flowchart LR
    UI["Next.js Frontend\n(app/page.js & app/dashboard/page.js)"]
    API["vanhiking-api\n(Cloudflare Worker + D1)"]
    MapTiles["CARTO & Esri World Imagery\n(MapLibre GL Basemaps)"]
    FB["Facebook Page\n(長青健行社 Posts & Insights)"]

    UI -->|"GET /hikes, /posts/:id, /snapshots, /audience, /stats"| API
    UI -->|"Vector / Satellite Tiles"| MapTiles
    API -.->|"Archived Posts & Metrics"| FB
```

### API Endpoints Consumed

| Endpoint | Purpose |
| --- | --- |
| `GET /hikes` | Paginated hike records (`limit=100` until `total` reached), including `geometry`, `meeting_point`, `distance_km`, `est_duration_min`, `post_ids` |
| `GET /posts` | Archived club Facebook posts |
| `GET /posts/:id` | Single post metadata (`post_type` used to label photo vs. video links) |
| `GET /snapshots` | Daily Facebook insights snapshots (aggregated monthly on `/dashboard`) |
| `GET /audience` | Audience breakdown data |
| `GET /stats` | Club-wide summary totals |

---

## Project Structure

```text
van-hiking/
├── app/
│   ├── dashboard/
│   │   └── page.js        # Analytics dashboard (/dashboard)
│   ├── globals.css        # Global styles, theme tokens, map pin & selection states
│   ├── layout.js          # Root layout & ThemeProvider
│   └── page.js            # Landing map, filters, timeline list, mobile drawer
├── components/
│   ├── reui/
│   │   └── timeline.jsx   # ReUI Timeline component
│   ├── ui/                # shadcn/ui & mapcn primitives (button, drawer, map, select)
│   ├── header.jsx         # Top navigation bar & theme toggle
│   ├── hike-map.jsx       # MapLibre GL map, pins, animated route, satellite toggle
│   ├── mode-toggle.jsx    # Light / dark theme switcher
│   └── theme-provider.jsx # next-themes wrapper
├── lib/
│   └── utils.js           # Classname merge helper
├── AGENTS.md              # Architecture, design rules, and maintainer playbook
├── components.json        # shadcn / ReUI / mapcn registry configuration
├── jsconfig.json          # Path aliases (@/*)
├── next.config.js         # Next.js configuration
└── package.json
```

---

## Quick Start

### Prerequisites

- Node.js 18+ (Node 20+ recommended)
- `npm`

### Local Development

```bash
git clone https://github.com/dev-ansung/van-hiking.git
cd van-hiking
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm run start
```

---

## Data & Policy Notes

- **Estimated Routes & Times**: Trail geometries are reconstructed using Valhalla pedestrian routing, and estimated durations assume 4 km/h (`distance_km / 4`). Actual walking durations are marked as pending (`待回報`).
- **Historical Archive Only**: The club is closed; only completed hikes are recorded and displayed. Upcoming routes are never published.
- **Maintainer Guide**: See [`AGENTS.md`](./AGENTS.md) for strict UI, data-handling, and verification rules before making changes.
