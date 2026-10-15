"""Summarise GLGP Stripe subscriptions and refunds into the dashboard's stripe.json.

Usage:
    python stripe_summary.py <subs.json> <refunds.json> <out.json>

<subs.json>    list of {id, status, product, created, ended_at, rebills, reason}
<refunds.json> list of {id, amount, status, created, desc, customer}
Both are flattened from the Stripe API with jq (see REFRESH.md).
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

# Stripe product id -> board line. Elite and balance products are deliberately left out.
PRODUCTS = {
    "prod_U727EbAgfXOnfz": "Go Live Get Paid",
    "prod_UHFCCjh1ieURAQ": "Go Live Get Paid",
    "prod_UOxD5T0MGRJNgd": "Go Live Get Paid",
    "prod_V53kQOynDytD8Z": "Go Live Get Paid",
    "prod_VMBavjRoZC7tbi": "Go Live Get Paid",
    "prod_V2hvF415i1oECS": "Platinum upsell",
    "prod_V2iGBycofS29l3": "Platinum upsell",
    "prod_VOoxmdwzK9L5rQ": "4 Digit Christmas",
}
ORDER = ["Go Live Get Paid", "Platinum upsell", "4 Digit Christmas"]
MONTH = 30.4 * 86400
GRACE = 5 * 86400  # a plan that ended within 5 days of its last scheduled payment counts as completed


def classify(s):
    if s["status"] == "active":
        return "active"
    if s["status"] in ("past_due", "unpaid", "incomplete"):
        return "at_risk"
    if s["status"] in ("canceled", "incomplete_expired"):
        rebills = float(s.get("rebills") or 0)
        lived = (s.get("ended_at") or s["created"]) - s["created"]
        return "completed" if rebills and lived >= rebills * MONTH - GRACE else "cancelled"
    return "other"


def refund_line(desc):
    d = (desc or "").lower()
    if "elite" in d:
        return None
    if "christmas" in d:
        return "4 Digit Christmas"
    if "go live get paid" in d and "platinum" in d:
        return "Platinum upsell"
    if "go live get paid" in d or "glgp" in d:
        return "Go Live Get Paid"
    return None


def main(subs_path, refunds_path, out_path):
    subs = {s["id"]: s for s in json.load(open(subs_path))}.values()
    counts = defaultdict(Counter)
    for s in subs:
        line = PRODUCTS.get(s["product"])
        if line:
            counts[line][classify(s)] += 1

    refunds = {r["id"]: r for r in json.load(open(refunds_path))}.values()
    by_line = defaultdict(lambda: {"n": 0, "amount": 0.0})
    customers = set()
    for r in refunds:
        line = refund_line(r.get("desc"))
        if not line or r.get("status") != "succeeded":
            continue
        by_line[line]["n"] += 1
        by_line[line]["amount"] += r["amount"] / 100
        customers.add(r.get("customer"))

    keys = ["active", "at_risk", "completed", "cancelled"]
    plans = [{"plan": k, **{c: counts[k][c] for c in keys}, "all": sum(counts[k].values())} for k in ORDER]
    out = {
        "source": "Stripe",
        "synced_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "plans": plans,
        "totals": {c: sum(p[c] for p in plans) for c in keys + ["all"]},
        "refunds": [{"product": k, **by_line[k]} for k in ORDER if by_line[k]["n"]],
        "refund_totals": {
            "n": sum(v["n"] for v in by_line.values()),
            "amount": round(sum(v["amount"] for v in by_line.values()), 2),
            "customers": len(customers),
        },
    }
    json.dump(out, open(out_path, "w"), indent=1)
    print(json.dumps(out["totals"]), json.dumps(out["refund_totals"]))


if __name__ == "__main__":
    main(*sys.argv[1:4])
