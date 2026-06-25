#!/usr/bin/env python3
"""
Daily ActiveCampaign email stats report.

Posts to Slack #reporting-email-marketing at 10am UK time.

iOS MPP filtering:
  ActiveCampaign natively tracks verified_unique_opens — opens confirmed by
  subsequent link clicks or other engagement signals, filtering out Apple Mail
  Privacy Protection machine-opens. We use this field directly.
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo


# ---------------------------------------------------------------------------
# Config (from environment)
# ---------------------------------------------------------------------------

AC_API_KEY   = os.environ["AC_API_KEY"]
AC_API_URL   = os.environ["AC_API_URL"].rstrip("/")   # e.g. https://account.api-ac.com
SLACK_TOKEN  = os.environ["SLACK_BOT_TOKEN"]
SLACK_CHANNEL = "reporting-email-marketing"

UK_TZ = ZoneInfo("Europe/London")


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def get_yesterday_uk():
    """Return (date_label, yesterday_date_str) for the previous UK calendar day."""
    now_uk     = datetime.now(UK_TZ)
    yest_uk    = now_uk - timedelta(days=1)
    date_label = yest_uk.strftime("%A, %d %B %Y")
    date_str   = yest_uk.strftime("%Y-%m-%d")   # e.g. "2026-06-24"
    return date_label, date_str


# ---------------------------------------------------------------------------
# ActiveCampaign API
# ---------------------------------------------------------------------------

def ac_get(path, params=None):
    headers = {"Api-Token": AC_API_KEY, "Accept": "application/json"}
    url = f"{AC_API_URL}/api/3{path}"
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_campaigns_sent_yesterday(yesterday_date_str):
    """
    Page through complete campaigns sorted by sdate DESC, collecting those
    whose sdate date portion matches yesterday_date_str (e.g. "2026-06-24").

    AC stores sdate with the account's local timezone offset, so comparing
    the date prefix (first 10 chars of the ISO string) matches what the AC
    dashboard shows — no timezone conversion needed.
    """
    collected = []
    offset    = 0
    limit     = 100

    while True:
        data  = ac_get("/campaigns", params={
            "status":         5,         # 5 = complete
            "orders[sdate]":  "DESC",
            "limit":          limit,
            "offset":         offset,
        })
        batch = data.get("campaigns", [])
        if not batch:
            break

        for c in batch:
            sdate = (c.get("sdate") or "")[:10]   # "2026-06-24"
            if sdate == yesterday_date_str:
                collected.append(c)
            elif sdate < yesterday_date_str:
                # Sorted descending — everything here is older, stop paging
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
    """
    Extract send/engagement stats from an AC campaign record.

    ActiveCampaign natively provides verified_unique_opens — opens confirmed
    by engagement signals, filtering out iOS MPP machine-opens automatically.
    """
    sends            = safe_int(campaign.get("total_amt"))
    raw_opens        = safe_int(campaign.get("uniqueopens"))
    verified_opens   = safe_int(campaign.get("verified_unique_opens"))
    clicks           = safe_int(campaign.get("uniquelinkclicks"))
    unsubs           = safe_int(campaign.get("unsubscribes"))
    hard_bounces     = safe_int(campaign.get("hardbounces"))
    soft_bounces     = safe_int(campaign.get("softbounces"))
    suspected_ios    = max(0, raw_opens - verified_opens)

    return {
        "name":               campaign.get("name", "Unnamed Campaign"),
        "sends":              sends,
        "raw_opens":          raw_opens,
        "raw_open_rate":      pct(raw_opens, sends),
        "verified_opens":     verified_opens,
        "verified_open_rate": pct(verified_opens, sends),
        "suspected_ios":      suspected_ios,
        "clicks":             clicks,
        "click_rate":         pct(clicks, sends),
        "unsubscribes":       unsubs,
        "hard_bounces":       hard_bounces,
        "soft_bounces":       soft_bounces,
        "total_bounces":      hard_bounces + soft_bounces,
    }


# ---------------------------------------------------------------------------
# Slack message builder
# ---------------------------------------------------------------------------

def build_slack_blocks(date_label, stats_list):
    if not stats_list:
        return [{
            "type": "section",
            "text": {"type": "mrkdwn", "text": (
                f":bar_chart: *Daily Email Report — {date_label}*\n\n"
                "No campaigns were sent yesterday."
            )}
        }]

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"Daily Email Report — {date_label}", "emoji": True}
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": (
                ":information_source: *Verified opens* = ActiveCampaign's native `verified_unique_opens` "
                "(iOS MPP machine-opens filtered out). Raw opens shown for reference."
            )}]
        },
        {"type": "divider"},
    ]

    for s in stats_list:
        blocks.append({
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
        })
        blocks.append({"type": "divider"})

    # Totals summary
    n             = len(stats_list)
    total_sends   = sum(s["sends"]         for s in stats_list)
    total_v_opens = sum(s["verified_opens"] for s in stats_list)
    total_clicks  = sum(s["clicks"]         for s in stats_list)
    total_unsubs  = sum(s["unsubscribes"]   for s in stats_list)
    total_bounces = sum(s["total_bounces"]  for s in stats_list)

    blocks.append({
        "type": "section",
        "text": {"type": "mrkdwn", "text": (
            f":bar_chart: *Totals across {n} campaign{'s' if n != 1 else ''}*\n"
            f">Sends: *{total_sends:,}*   "
            f"Verified Opens: *{total_v_opens:,}* ({pct(total_v_opens, total_sends)}%)   "
            f"Clicks: *{total_clicks:,}* ({pct(total_clicks, total_sends)}%)   "
            f"Unsubs: *{total_unsubs:,}*   "
            f"Bounces: *{total_bounces:,}*"
        )}
    })

    return blocks


# ---------------------------------------------------------------------------
# Slack posting
# ---------------------------------------------------------------------------

def post_to_slack(blocks, fallback_text):
    headers = {
        "Authorization": f"Bearer {SLACK_TOKEN}",
        "Content-Type":  "application/json",
    }
    payload = {
        "channel": SLACK_CHANNEL,
        "blocks":  blocks,
        "text":    fallback_text,
    }
    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers=headers,
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    result = resp.json()
    if not result.get("ok"):
        raise RuntimeError(f"Slack API error: {result.get('error')}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    date_label, yesterday_date_str = get_yesterday_uk()
    print(f"Fetching campaigns sent on {date_label} (sdate = {yesterday_date_str})...")

    campaigns = fetch_campaigns_sent_yesterday(yesterday_date_str)
    print(f"Found {len(campaigns)} campaign(s).")

    stats_list = [compute_stats(c) for c in campaigns]
    blocks     = build_slack_blocks(date_label, stats_list)

    fallback = (
        f"Daily Email Report — {date_label}: "
        f"{len(stats_list)} campaign(s) sent yesterday."
    )

    print("Posting to Slack...")
    post_to_slack(blocks, fallback)
    print("Done.")


if __name__ == "__main__":
    main()
