export type SheetMetricRow = {
  metric_date: string; // yyyy-MM-dd
  dimension: string;
  metric_name: string;
  metric_value: number;
};

export type SheetSource = {
  spreadsheetId: string;
  displayName: string;
  offerSlug: string;
  range: string;
  parse: (rows: string[][]) => SheetMetricRow[];
};

/**
 * "MPSH // Campaign Stats // Accelerate // Leads" — this spreadsheet has ~44 tabs.
 * The unqualified default tab (REPORT_SSM) looked clean but breaks down into repeated
 * stale values partway through (a broken formula, not real daily data) — confirmed by
 * fetching and inspecting it directly, not safe to sync.
 *
 * "2026_LEADS" is a raw per-registrant event log (timestamp, email, source) — reliable,
 * but contains PII (email). We aggregate to daily counts here and never let the email
 * column reach the return value, so no PII is ever written to Supabase.
 */
function parseRawLeadTimestamps(rows: string[][]): SheetMetricRow[] {
  const countsByDate = new Map<string, number>();

  for (const row of rows) {
    const timestamp = row[0];
    if (!timestamp) continue;
    const date = timestamp.slice(0, 10); // "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1);
  }

  return Array.from(countsByDate.entries()).map(([metric_date, count]) => ({
    metric_date,
    dimension: "",
    metric_name: "leads",
    metric_value: count,
  }));
}

/**
 * "MPSH // Campaign Stats // WhatNot // Go Live Get Paid", tab "2026_LEADS" — layout
 * confirmed by direct fetch: A=CAMPAIGN, B=DATE ("YYYY-MM-DD HH:MM:SS"), C=NAME,
 * D=EMAIL, E=WEBINAR TYPE, F=UTM_SOURCE. 24.5k rows, no gaps/bad dates through today.
 * Aggregated to daily counts per UTM_SOURCE; name/email never reach the return value.
 */
function parseGlgpLeadTimestamps(rows: string[][]): SheetMetricRow[] {
  const countsByDateSource = new Map<string, number>();

  for (const row of rows) {
    const timestamp = row[1];
    if (!timestamp) continue;
    const date = timestamp.slice(0, 10); // "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const source = row[5] || "unknown";
    const key = `${date}|${source}`;
    countsByDateSource.set(key, (countsByDateSource.get(key) ?? 0) + 1);
  }

  return Array.from(countsByDateSource.entries()).map(([key, count]) => {
    const [metric_date, dimension] = key.split("|");
    return { metric_date, dimension, metric_name: "leads", metric_value: count };
  });
}

export const SHEET_SOURCES: SheetSource[] = [
  {
    spreadsheetId: "1s6F57qZ7fuHnr6jiiVZ5ad9Sag17c7Vrm0a2urCcmVc",
    displayName: "MPSH // Campaign Stats // Accelerate // 2026 Leads",
    offerSlug: "accelerate",
    range: "2026_LEADS!A2:A10000",
    parse: parseRawLeadTimestamps,
  },
  {
    spreadsheetId: "1vsDz6o78A-CP23ctFN4luKGOLv4s1YiZqvJhElqzpdA",
    displayName: "MPSH // Campaign Stats // WhatNot // Go Live Get Paid // 2026 Leads",
    offerSlug: "glgp",
    range: "2026_LEADS!A2:F30000",
    parse: parseGlgpLeadTimestamps,
  },
];
