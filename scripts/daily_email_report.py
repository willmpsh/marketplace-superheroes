#!/usr/bin/env python3
"""
Daily ActiveCampaign email stats report.

Posts to Slack #reporting-email-marketing at 10am UK time.
On Mondays, also posts a weekly summary for the previous Mon–Sun before the daily report.

iOS MPP filtering:
  ActiveCampaign natively tracks verified_unique_opens — opens confirmed by
  subsequent link clicks or other engagement signals, filtering out Apple Mail
  Privacy Protection machine-opens. We use this field directly.
"""

import os
import requests
from datetime import datetime, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo


# ---------------------------------------------------------------------------
# Config (from environment)
# ---------------------------------------------------------------------------

AC_API_KEY    = os.environ["AC_API_KEY"]
AC_API_URL    = os.environ["AC_API_URL"].rstrip("/")
SLACK_TOKEN   = os.environ["SLACK_BOT_TOKEN"]
SLACK_CHANNEL = "reporting-email-marketing"

UK_TZ = ZoneInfo("Europe/London")


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def get_yesterday_uk():
    """Return (date_label, date_str) for the previous UK calendar day."""
    now_uk     = datetime.now(UK_TZ)
    yest_uk    = now_uk - timedelta(days=1)
    return yest_uk.strftime("%A, %d %B %Y"), yest_uk.strftime("%Y-%m-%d")


def get_last_week_uk():
    """
    Return (week_label, [date_str, ...]) for the previous Mon–Sun week (UK time).
    Called only on Mondays.
    """
    now_uk      = datetime.now(UK_TZ)
    last_monday = now_uk - timedelta(days=now_uk.weekday() + 7)
    dates       = [(last_monday + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    week_start  = (last_monday).strftime("%d %b")
    week_end    = (last_monday + timedelta(days=6)).strftime("%d %b %Y")
    return f"{week_start} – {week_end}", dates


def is_monday_uk():
    return datetime.now(UK_TZ).weekday() == 0


# ---------------------------------------------------------------------------
# ActiveCampaign API
# ---------------------------------------------------------------------------

def ac_get(path, params=None):
    headers = {"Api-Token": AC_API_KEY, "Accept": "application/json"}
    resp = requests.get(f"{AC_API_URL}/api/3{path}", headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_campaigns_for_dates(date_strs):
    """
    Fetch all complete campaigns whose sdate date portion is in date_strs.
    date_strs should be a set or list of "YYYY-MM-DD" strings.
    Pages through AC sorted by sdate DESC, stops once past the earliest date.
    """
    date_set  = set(date_strs)
    earliest  = min(date_set)
    collected = []
    offset    = 0
    limit     = 100

    while True:
        data  = ac_get("/campaigns", params={
            "status":        5,
            "orders[sdate]": "DESC",
            "limit":         limit,
            "offset":        offset,
        })
        batch = data.get("campaigns", [])
        if not batch:
            break

        for c in batch:
            sdate = (c.get("sdate") or "")[:10]
            if sdate in date_set:
                collected.append(c)
            elif sdate < earliest:
                return collected

        if len(batch) < limit:
            break
        offset += limit

    return collected


# ---------------------------------------------------------------------------
# Stats computation
# ---------------------------------------------------------------------------

def safe_int(v):
    try:
        return int(v or 0)
    except (ValueError, TypeError):
        return 0


def pct(n, d):
    return round(n / d * 100, 1) if d else 0.0


def compute_stats(campaign):
    sends          = safe_int(campaign.get("total_amt"))
    raw_opens      = safe_int(campaign.get("uniqueopens"))
    verified_opens = safe_int(campaign.get("verified_unique_opens"))
    clicks         = safe_int(campaign.get("uniquelinkclicks"))
    unsubs         = safe_int(campaign.get("unsubscribes"))
    hard_bounces   = safe_int(campaign.get("hardbounces"))
    soft_bounces   = safe_int(campaign.get("softbounces"))

    return {
        "name":               campaign.get("name", "Unnamed Campaign"),
        "sends":              sends,
        "raw_opens":          raw_opens,
        "raw_open_rate":      pct(raw_opens, sends),
        "verified_opens":     verified_opens,
        "verified_open_rate": pct(verified_opens, sends),
        "suspected_ios":      max(0, raw_opens - verified_opens),
        "clicks":             clicks,
        "click_rate":         pct(clicks, sends),
        "unsubscribes":       unsubs,
        "hard_bounces":       hard_bounces,
        "soft_bounces":       soft_bounces,
        "total_bounces":      hard_bounces + soft_bounces,
    }


def aggregate(stats_list):
    n             = len(stats_list)
    total_sends   = sum(s["sends"]          for s in stats_list)
    total_v_opens = sum(s["verified_opens"] for s in stats_list)
    total_clicks  = sum(s["clicks"]         for s in stats_list)
    total_unsubs  = sum(s["unsubscribes"]   for s in stats_list)
    total_bounces = sum(s["total_bounces"]  for s in stats_list)
    return n, total_sends, total_v_opens, total_clicks, total_unsubs, total_bounces


# ---------------------------------------------------------------------------
# Slack block builders
# ---------------------------------------------------------------------------

IOS_FOOTNOTE = (
    ":information_source: *Verified opens* = AC's native `verified_unique_opens` "
    "(iOS MPP machine-opens filtered out). Raw opens shown for reference."
)


def campaign_section(s):
    return {
        "type": "section",
        "text": {"type": "mrkdwn", "text": (
            f"*{s['name']}*\n"
            f">*Sends:* {s['sends']:,}\n"
            f">*Verified Opens:* {s['verified_opens']:,} *({s['verified_open_rate']}%)*   "
            f"Raw: {s['raw_opens']:,} ({s['raw_open_rate']}%)   "
            f"Suspected iOS: {s['suspected_ios']:,}\n"
            f">*Clicks:* {s['clicks']:,} ({s['click_rate']}%)\n"
            f">*Unsubscribes:* {s['unsubscribes']:,}   "
            f"*Bounces:* {s['total_bounces']:,} "
            f"_(Hard: {s['hard_bounces']:,} / Soft: {s['soft_bounces']:,})_"
        )}
    }


def totals_section(stats_list, label="Totals"):
    n, sends, v_opens, clicks, unsubs, bounces = aggregate(stats_list)
    return {
        "type": "section",
        "text": {"type": "mrkdwn", "text": (
            f":bar_chart: *{label} — {n} campaign{'s' if n != 1 else ''}*\n"
            f">Sends: *{sends:,}*   "
            f"Verified Opens: *{v_opens:,}* ({pct(v_opens, sends)}%)   "
            f"Clicks: *{clicks:,}* ({pct(clicks, sends)}%)   "
            f"Unsubs: *{unsubs:,}*   "
            f"Bounces: *{bounces:,}*"
        )}
    }


def build_daily_blocks(date_label, stats_list):
    if not stats_list:
        return [{"type": "section", "text": {"type": "mrkdwn",
            "text": f":bar_chart: *Daily Email Report — {date_label}*\n\nNo campaigns were sent yesterday."}}]

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": f"Daily Email Report — {date_label}", "emoji": True}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": IOS_FOOTNOTE}]},
        {"type": "divider"},
    ]
    for s in stats_list:
        blocks.append(campaign_section(s))
        blocks.append({"type": "divider"})
    blocks.append(totals_section(stats_list, "Totals"))
    return blocks


def build_weekly_blocks(week_label, stats_list):
    if not stats_list:
        return [{"type": "section", "text": {"type": "mrkdwn",
            "text": f":calendar: *Weekly Email Summary — {week_label}*\n\nNo campaigns were sent last week."}}]

    # Group by day for the per-day breakdown
    by_day = {}
    for s in stats_list:
        day = s.get("_sdate", "")[:10]
        by_day.setdefault(day, []).append(s)

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": f"Weekly Email Summary — {week_label}", "emoji": True}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": IOS_FOOTNOTE}]},
        {"type": "divider"},
        totals_section(stats_list, "Week totals"),
        {"type": "divider"},
    ]

    for day_str in sorted(by_day.keys()):
        day_campaigns = by_day[day_str]
        try:
            day_label = datetime.strptime(day_str, "%Y-%m-%d").strftime("%A, %d %b")
        except ValueError:
            day_label = day_str

        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*{day_label}*"}})
        for s in day_campaigns:
            blocks.append(campaign_section(s))
        if len(day_campaigns) > 1:
            blocks.append(totals_section(day_campaigns, f"{day_label} totals"))
        blocks.append({"type": "divider"})

    return blocks


# ---------------------------------------------------------------------------
# Slack posting
# ---------------------------------------------------------------------------

def post_to_slack(blocks, fallback_text):
    headers = {"Authorization": f"Bearer {SLACK_TOKEN}", "Content-Type": "application/json"}
    payload = {"channel": SLACK_CHANNEL, "blocks": blocks, "text": fallback_text}
    resp = requests.post("https://slack.com/api/chat.postMessage", headers=headers, json=payload, timeout=15)
    resp.raise_for_status()
    result = resp.json()
    if not result.get("ok"):
        raise RuntimeError(f"Slack API error: {result.get('error')}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    # --- Weekly summary (Mondays only) ---
    if is_monday_uk():
        week_label, week_dates = get_last_week_uk()
        print(f"Monday detected — fetching weekly summary for {week_label}...")
        weekly_campaigns = fetch_campaigns_for_dates(week_dates)
        print(f"  Found {len(weekly_campaigns)} campaign(s) across the week.")
        weekly_stats = []
        for c in weekly_campaigns:
            s = compute_stats(c)
            s["_sdate"] = (c.get("sdate") or "")[:10]
            weekly_stats.append(s)
        weekly_blocks = build_weekly_blocks(week_label, weekly_stats)
        post_to_slack(weekly_blocks, f"Weekly Email Summary — {week_label}: {len(weekly_stats)} campaigns.")
        print("Weekly summary posted.")

    # --- Daily report (every day) ---
    date_label, yesterday_str = get_yesterday_uk()
    print(f"Fetching daily campaigns for {date_label} (sdate = {yesterday_str})...")
    daily_campaigns = fetch_campaigns_for_dates([yesterday_str])
    print(f"  Found {len(daily_campaigns)} campaign(s).")
    daily_stats = [compute_stats(c) for c in daily_campaigns]
    daily_blocks = build_daily_blocks(date_label, daily_stats)
    post_to_slack(daily_blocks, f"Daily Email Report — {date_label}: {len(daily_stats)} campaign(s).")
    print("Daily report posted. Done.")


if __name__ == "__main__":
    main()
