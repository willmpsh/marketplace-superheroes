#!/usr/bin/env python3
"""
Daily ActiveCampaign email stats report.

Posts to Slack #reporting-email-marketing at 10am UK time.

iOS MPP filtering approach:
  Apple's Mail Privacy Protection pre-fetches tracking pixels, inflating raw open
  counts. Since we can't distinguish MPP opens at the API level, we use unique
  link clicks as a conservative "verified opens" proxy — every click proves a
  real human opened and engaged with the email. Raw opens are shown alongside
  for reference.
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
    """Return (date_str, start_utc, end_utc) for the previous UK calendar day."""
    now_uk    = datetime.now(UK_TZ)
    yest_uk   = now_uk - timedelta(days=1)
    start_uk  = datetime(yest_uk.year, yest_uk.month, yest_uk.day,  0,  0,  0, tzinfo=UK_TZ)
    end_uk    = datetime(yest_uk.year, yest_uk.month, yest_uk.day, 23, 59, 59, tzinfo=UK_TZ)
    date_label = yest_uk.strftime("%A, %d %B %Y")
    return date_label, start_uk.astimezone(timezone.utc), end_uk.astimezone(timezone.utc)


def parse_ac_datetime(value):
    """Parse an ActiveCampaign datetime string or Unix timestamp to UTC datetime."""
    if not value or value in ("0000-00-00 00:00:00", ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    # AC returns strings like "2024-06-24 09:15:00" (UTC)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(value.strip(), fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# ActiveCampaign API
# ---------------------------------------------------------------------------

def ac_get(path, params=None):
    headers = {"Api-Token": AC_API_KEY, "Accept": "application/json"}
    url = f"{AC_API_URL}/api/3{path}"
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_campaigns_sent_yesterday(start_utc, end_utc):
    """
    Page through complete campaigns sorted by ldate DESC, collecting those
    whose ldate (last-sent date) falls within the given UTC window.
    Stops early once ldate goes before the window.
    """
    collected = []
    offset    = 0
    limit     = 100

    while True:
        data  = ac_get("/campaigns", params={
            "status":         5,         # 5 = complete
            "orders[ldate]":  "DESC",
            "limit":          limit,
            "offset":         offset,
        })
        batch = data.get("campaigns", [])
        if not batch:
            break

        for c in batch:
            ldate_dt = parse_ac_datetime(c.get("ldate"))
            if ldate_dt is None:
                continue
            if start_utc <= ldate_dt <= end_utc:
                collected.append(c)
            elif ldate_dt < start_utc:
                # Sorted descending — everything after this is older, stop paging
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

    Verified opens = unique link clicks (conservative iOS-MPP-filtered proxy).
    Suspected iOS opens = raw unique opens minus verified opens (indicative only).
    """
    sends         = safe_int(campaign.get("total_amt"))
    raw_opens     = safe_int(campaign.get("uniqueopens"))
    clicks        = safe_int(campaign.get("uniquelinkclicks"))
    unsubs        = safe_int(campaign.get("unsubscribes"))
    hard_bounces  = safe_int(campaign.get("hardbounces"))
    soft_bounces  = safe_int(campaign.get("softbounces"))

    # Clicks are the verified-open floor: a click can only happen if the email
    # was genuinely opened by a human. Raw opens include iOS MPP pre-fetches.
    verified_opens  = clicks
    suspected_ios   = max(0, raw_opens - verified_opens)

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
                ":information_source: *Verified opens* = unique clicks (iOS MPP filter proxy). "
                "Raw opens shown for reference. Suspected iOS opens = raw opens minus verified opens."
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
    date_label, start_utc, end_utc = get_yesterday_uk()
    print(f"Fetching campaigns sent on {date_label} (UK time)...")
    print(f"  UTC window: {start_utc.isoformat()} → {end_utc.isoformat()}")

    campaigns = fetch_campaigns_sent_yesterday(start_utc, end_utc)
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
