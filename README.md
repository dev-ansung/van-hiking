# Evergreen Hiking Club — Hiking Map

<!-- 中文版：[README.zh-TW.md](README.zh-TW.md) -->

An interactive map of every hike taken by the Evergreen Hiking Club (長青健行社, Vancouver) since 2019 — 202 hikes, about 992 km in total.

- **Live site:** https://vanhiking.vercel.app
- **Dashboard:** https://vanhiking.vercel.app/dashboard
- **Repository:** this repo contains both the website and its backend API worker (under `api/` — a Cloudflare Worker that serves the hike, post, and insights data).

## What it shows

- **Map** — every club hike since 2019 plotted on the map: 202 routes, ~992 km total.
- **Every hike recorded** — date, meeting point, route, distance, and estimated duration.
- **Linked to Facebook** — each hike links directly to the photos and video posted on the club's Facebook Page that day.

## How to use it (on a phone)

1. Open https://vanhiking.vercel.app on your phone.
2. Each pin on the map is one hike; the pin sits at that hike's meeting point.
3. Tap a pin to draw the route on the map and open the hike's detail card.
4. To find a specific hike, use the search box (place names) or filter by year and week. By default only the last 3 months are shown.
5. The detail card has "View photos on Facebook" and "View video on Facebook" links that open that day's posts.
6. Switch between map and satellite view from the top right — satellite is clearer for trails.
7. On phones, pull the bottom sheet up for details; on desktop the list stays fixed on the left.

## Where the data comes from

Data comes from the Evergreen Hiking Club Facebook Page (https://www.facebook.com/VancouverEvergreenHiking) — its posts and insights.

- Distances and times are **estimates**: routes are reconstructed along walking trails, and times are calculated at 4 km/h — they are not measured.
- Actual walking times are "to be reported": if you remember how long a hike actually took, let us know.
- Only hikes that have **already taken place** are listed; upcoming routes are never published.

## Maintainer

Maintained by An Sung. Questions? Please contact him.
