"""Build the GLGP sales dashboard HTML from the campaign sheet and Stripe data.

Usage:
    python build.py <sheet.xlsx> <stripe.json> <out.html> [--today YYYY-MM-DD]

<sheet.xlsx>  export of "MPSH // Campaign Stats // WhatNot // Go Live Get Paid"
<stripe.json> output of stripe_summary.py

Only aggregates are written into the page: no names or emails.
"""
import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

TYPES = ["MAIN", "DEAL", "PLATINUM"]  # PLATINUM is the upsell, not a new customer
FRONT = ["MAIN", "DEAL"]
TEMPLATE = Path(__file__).with_name("template.html")


def load_sales(path):
    df = pd.read_excel(path, sheet_name="SALES", usecols="A:N")
    df = df.dropna(subset=["DATE"])
    df["DATE"] = pd.to_datetime(df["DATE"])
    df["day"] = df["DATE"].dt.date
    df["TYPE"] = df["TYPE"].str.strip().str.upper()
    df["STATUS"] = df["STATUS"].str.strip().str.upper()
    df["AMOUNT"] = pd.to_numeric(df["AMOUNT"], errors="coerce").fillna(0)
    df["SOURCE"] = df["SOURCE"].fillna("(blank)").astype(str).str.strip()
    return df


def window(df, start, end):
    w = df[(df["day"] >= start) & (df["day"] <= end)]
    front = w[w["TYPE"].isin(FRONT)]
    plat = w[w["TYPE"] == "PLATINUM"]
    return {
        "sales": int(len(front)),
        "platinum": int(len(plat)),
        "amount": float(w["AMOUNT"].sum()),
        "refunds": int((w["STATUS"] == "REFUND").sum()),
    }


def build(df, stripe, today):
    first = df["day"].min()
    month_start = today.replace(day=1)
    kpis = {
        "today": window(df, today, today),
        "yesterday": window(df, today - timedelta(days=1), today - timedelta(days=1)),
        "last7": window(df, today - timedelta(days=6), today),
        "prev7": window(df, today - timedelta(days=13), today - timedelta(days=7)),
        "mtd": window(df, month_start, today),
        "all": window(df, first, today),
    }

    start = max(first, today - timedelta(days=89))
    days = []
    d = start
    while d <= today:
        w = df[df["day"] == d]
        row = {"date": d.isoformat(), "amount": float(w["AMOUNT"].sum())}
        for t in TYPES:
            row[t] = int((w["TYPE"] == t).sum())
        days.append(row)
        d += timedelta(days=1)

    status = {}
    for t in TYPES:
        w = df[df["TYPE"] == t]
        status[t] = {s: int(n) for s, n in w["STATUS"].value_counts().items()}

    def group(col, top=None):
        rows = []
        for key, w in df.groupby(col):
            front = w[w["TYPE"].isin(FRONT)]
            rows.append({
                "key": str(key),
                "sales": int(len(front)),
                "platinum": int((w["TYPE"] == "PLATINUM").sum()),
                "amount": float(w["AMOUNT"].sum()),
                "refunds": int((w["STATUS"] == "REFUND").sum()),
            })
        rows.sort(key=lambda r: (-r["sales"], -r["amount"]))
        return rows[:top] if top else rows

    front_all = df[df["TYPE"].isin(FRONT)]
    last30 = df[df["day"] >= today - timedelta(days=29)]
    front30 = last30[last30["TYPE"].isin(FRONT)]

    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "today": today.isoformat(),
        "latest_sale": df["DATE"].max().strftime("%Y-%m-%d %H:%M"),
        "first_sale": first.isoformat(),
        "rows": int(len(df)),
        "kpis": kpis,
        "platinum_rate": {
            "all": (int((df["TYPE"] == "PLATINUM").sum()) / len(front_all)) if len(front_all) else 0,
            "last30": (int((last30["TYPE"] == "PLATINUM").sum()) / len(front30)) if len(front30) else 0,
        },
        "days": days,
        "status": status,
        "products": group("PRODUCT"),
        "promos": group("PROMO"),
        "sheet_refund_buyers": int(df.loc[df["STATUS"] == "REFUND", "EMAIL"].str.lower().nunique()),
        "sources": group("SOURCE", top=12),
        "stripe": stripe_block(stripe),
    }


def stripe_block(stripe):
    return stripe  # already summarised by stripe_summary.py


def main():
    p = argparse.ArgumentParser()
    p.add_argument("xlsx")
    p.add_argument("stripe")
    p.add_argument("out")
    p.add_argument("--today", help="YYYY-MM-DD, defaults to today (UTC)")
    a = p.parse_args()
    today = date.fromisoformat(a.today) if a.today else datetime.utcnow().date()
    data = build(load_sales(a.xlsx), json.loads(Path(a.stripe).read_text()), today)
    html = TEMPLATE.read_text().replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
    Path(a.out).write_text(html)
    print(f"wrote {a.out}: {data['rows']} sales rows, latest {data['latest_sale']}")


if __name__ == "__main__":
    main()
