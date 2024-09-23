#!/usr/bin/env python3
"""Pull fresh Facebook Page data for the vanhiking dashboard and POST it
to vanhiking-api (https://vanhiking-api.ansung.dev).

What it fetches (via /opt/hatch/bin/facebook-cli, no login, no agent
contact):
  - pages account-insights for the 長青健行社 Page (page id
    775427925912036), LAST_28D window: follower count, views, unique
    viewers, engagement (with/without clicks), profile visits,
    new/unfollowers, net followers, messaging conversations, published
    content, views by follower status, content by type, and the
    audience breakdowns (age / gender / country / city).
  - pages posts list (LAST_28D, up to 10): per-post lifetime views,
    engagements, reactions, shares, comments.

What it posts (gated; idempotent upserts, safe to re-run):
  - POST /accounts            fb-changqing (follower_count refreshed)
  - POST /snapshots           one row, dated to the insights window's
                              end_date (not today — the window lags a day)
  - POST /audience/bulk       age/gender/country/city rows, same date
  - POST /posts/bulk          up to 10 recent posts

Auth: the gate password comes from the environment
(VANHIKING_GATE_PASSWORD) — never from a file in this repo. Every
request sends a Chrome browser User-Agent (Cloudflare returns 1010
for non-browser UAs).

Usage:
    VANHIKING_GATE_PASSWORD=<gate> python3 pull-fb.py [--time-range LAST_28D]

This script does NOT schedule itself; the daily cron runs it.
"""

import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

API_BASE = os.environ.get("VANHIKING_API_BASE", "https://vanhiking-api.ansung.dev")
FB_CLI = "/opt/hatch/bin/facebook-cli"
PAGE_ID = "775427925912036"
ACCOUNT_ID = "fb-changqing"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

ACCOUNT = {
    "id": ACCOUNT_ID,
    "platform": "facebook",
    "name": "長青健行社",
    "username": "VancouverEvergreenHiking",
    "url": "https://www.facebook.com/VancouverEvergreenHiking",
    "website": "https://evergreenhikingvan.github.io/",
}

INSIGHT_METRICS = [
    "follower_count", "views", "unique_viewers",
    "engagement_including_clicks", "engagement", "profile_visits",
    "new_followers", "unfollowers", "net_followers",
    "messaging_conversations", "published_content",
    "views_by_follower_status", "published_content_by_type",
    "followers_by_age", "followers_by_gender",
    "followers_by_country", "followers_by_city",
]

AUDIENCE_DIMS = {
    "followers_by_age": ("age", "percent"),
    "followers_by_gender": ("gender", "percent"),
    "followers_by_country": ("country", "count"),
    "followers_by_city": ("city", "count"),
}

# Meta returns some audience segments twice: once in simplified Chinese
# and once in traditional (e.g. 台湾 / 台灣, same bucket, same value),
# and city segments twice — once long-form ("台灣，臺中市",
# "加拿大不列颠哥伦比亚省列治文") and once short ("臺中市", "列治文").
# Normalize before POSTing so the store keeps one row per bucket.
# NOTE: the live breakdowns return ONLY the long/simplified forms —
# the short/traditional forms seen in an earlier read came from the
# seed. So cities must be SHORTENED to their canonical form, not merely
# deduped against a short form in the same batch.
SIMPLIFIED_TO_TRADITIONAL = {
    "台湾": "台灣",
    "美国": "美國",
    "马来西亚": "馬來西亞",
    "中国": "中國",
    "泰国": "泰國",
}

# Prefixes stripped from long-form city labels to get the canonical
# short form (the form used in the 2026-11-21 seed).
CITY_PREFIXES = ("加拿大不列颠哥伦比亚省", "台灣")


def shorten_city(segment):
    if " " in segment:
        segment = segment.split()[-1]
    if "，" in segment:
        segment = segment.split("，")[-1]
    for prefix in CITY_PREFIXES:
        if segment.startswith(prefix) and len(segment) > len(prefix):
            segment = segment[len(prefix):]
            break
    return segment


def normalize_audience(rows):
    for r in rows:
        r["segment"] = SIMPLIFIED_TO_TRADITIONAL.get(r["segment"], r["segment"])
        if r["dimension"] == "city":
            r["segment"] = shorten_city(r["segment"])
    by_dim = {}
    for r in rows:
        by_dim.setdefault(r["dimension"], []).append(r)
    keep = []
    for dim, rs in by_dim.items():
        segs = [r["segment"] for r in rs]
        for r in rs:
            # Suffix dedupe applies to cities only: a long-form label is
            # the same bucket as its short form. Other dimensions must
            # not use it — e.g. "FEMALE" endswith "MALE" but they are
            # different buckets.
            if dim == "city" and any(s != r["segment"] and r["segment"].endswith(s) for s in segs):
                continue
            keep.append(r)
    deduped = {}
    for r in keep:
        deduped[(r["account_id"], r["snapshot_date"], r["dimension"], r["segment"])] = r
    return list(deduped.values())


def run_cli(args):
    r = subprocess.run([FB_CLI] + args, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"facebook-cli {' '.join(args)} failed: {r.stderr.strip()[:300]}")
    return json.loads(r.stdout)


def parse_leading_int(rendered):
    """First integer in a rendered metric string, e.g. '39,446 vs 57,996 ...' -> 39446."""
    if not rendered:
        return None
    import re
    m = re.match(r"\s*([\d,]+)", str(rendered))
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def api_post(path, payload, gate):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        API_BASE + path, data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {gate}",
            "User-Agent": UA,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"POST {path} HTTP {e.code}: {e.read().decode()[:300]}")


def main():
    gate = os.environ.get("VANHIKING_GATE_PASSWORD")
    if not gate:
        sys.exit("VANHIKING_GATE_PASSWORD is not set")
    time_range = "LAST_28D"
    if "--time-range" in sys.argv:
        time_range = sys.argv[sys.argv.index("--time-range") + 1]

    insights = run_cli([
        "pages", "account-insights", "--page-id", PAGE_ID,
        "--metrics", ",".join(INSIGHT_METRICS),
        "--time-range", time_range,
    ])
    result = (insights.get("results") or [None])[0]
    if not result:
        sys.exit("account-insights returned no results")
    metrics = {m["field"]: m for m in result.get("metrics", [])}
    end_date = (insights.get("insights_time_range") or {}).get("end_date")
    if not end_date:
        sys.exit("account-insights returned no insights_time_range.end_date")

    def metric_int(field):
        m = metrics.get(field)
        if not m or m.get("availability") != "available":
            return None
        return parse_leading_int(m.get("rendered_text"))

    snapshot = {
        "account_id": ACCOUNT_ID,
        "date": end_date,
        "follower_count": metric_int("follower_count"),
        "views": metric_int("views"),
        "unique_viewers": metric_int("unique_viewers"),
        "engagement_including_clicks": metric_int("engagement_including_clicks"),
        "engagement": metric_int("engagement"),
        "profile_visits": metric_int("profile_visits"),
        "new_followers": metric_int("new_followers"),
        "unfollowers": metric_int("unfollowers"),
        "net_followers": metric_int("net_followers"),
        "messaging_conversations": metric_int("messaging_conversations"),
        "published_content": metric_int("published_content"),
    }
    details = {}
    for field, key in [("views_by_follower_status", "views_by_follower_status"),
                       ("published_content_by_type", "published_content_by_type")]:
        m = metrics.get(field)
        if m and m.get("availability") == "available" and isinstance(m.get("breakdown"), dict):
            details[key] = m["breakdown"]
    if details:
        snapshot["details"] = details

    audience = []
    for field, (dimension, unit) in AUDIENCE_DIMS.items():
        m = metrics.get(field)
        if not m or m.get("availability") != "available":
            continue
        breakdown = m.get("breakdown") or {}
        for segment, value in breakdown.items():
            audience.append({
                "account_id": ACCOUNT_ID,
                "snapshot_date": end_date,
                "dimension": dimension,
                "segment": segment,
                "value": value,
                "unit": unit,
            })

    posts_data = run_cli([
        "pages", "posts", "list", "--page-id", PAGE_ID,
        "--time-range", time_range, "--limit", "10",
    ])
    posts = []
    for row in posts_data.get("results", []):
        meta = row.get("metadata") or {}
        text = meta.get("metadata_text") or ""
        post_type = "video" if text.startswith("视频") else "photo" if text.startswith("照片") else None
        metrics_by_field = {m["field"]: m for m in row.get("metrics", [])}
        activity = {a["field"]: a for a in row.get("activity", [])}

        def post_int(source, field):
            m = source.get(field)
            if not m or m.get("availability") != "available":
                return None
            return parse_leading_int(m.get("rendered_text"))

        posts.append({
            "account_id": ACCOUNT_ID,
            "platform_post_id": str(row.get("object_id")),
            "caption": meta.get("caption_excerpt"),
            "published_at": row.get("published_time"),
            "post_type": post_type,
            "views": post_int(metrics_by_field, "views"),
            "engagements": post_int(metrics_by_field, "engagements"),
            "reactions": post_int(activity, "reactions"),
            "shares": post_int(activity, "shares"),
            "comment_count": post_int(activity, "comment_count"),
        })

    account = dict(ACCOUNT)
    if snapshot["follower_count"] is not None:
        account["follower_count"] = snapshot["follower_count"]
    audience = normalize_audience(audience)

    print("account:", api_post("/accounts", account, gate))
    print("snapshot:", api_post("/snapshots", snapshot, gate))
    for i in range(0, len(audience), 25):
        chunk = audience[i:i + 25]
        res = api_post("/audience/bulk", chunk, gate)
        print(f"audience bulk {i // 25 + 1}: ok={res.get('ok')} count={res.get('count')} failed={res.get('failed')}")
    if posts:
        res = api_post("/posts/bulk", posts, gate)
        print(f"posts bulk: ok={res.get('ok')} count={res.get('count')} failed={res.get('failed')}")
    print(f"done: snapshot {end_date}, {len(audience)} audience rows, {len(posts)} posts")


if __name__ == "__main__":
    main()
