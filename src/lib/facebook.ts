const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN!;
const FB_AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID!; // e.g. act_1882825839240
const GRAPH_VERSION = "v21.0";

type ActionEntry = { action_type: string; value: string };

type InsightRow = {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionEntry[];
  action_values?: ActionEntry[];
};

function sumActionValue(entries: ActionEntry[] | undefined, matchers: string[]) {
  if (!entries) return 0;
  return entries
    .filter((e) => matchers.some((m) => e.action_type.includes(m)))
    .reduce((sum, e) => sum + (parseFloat(e.value) || 0), 0);
}

const LEAD_ACTION_TYPES = ["lead"];
const PURCHASE_ACTION_TYPES = ["omni_purchase", "offsite_conversion.fb_pixel_purchase"];

export async function fetchDailyInsights(sinceDate: string, untilDate: string) {
  const fields = [
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "clicks",
    "inline_link_clicks",
    "actions",
    "action_values",
  ].join(",");

  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${FB_AD_ACCOUNT_ID}/insights` +
    `?level=campaign&fields=${fields}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: sinceDate, until: untilDate }))}` +
    `&time_increment=1&limit=200` +
    `&filtering=${encodeURIComponent(JSON.stringify([{ field: "impressions", operator: "GREATER_THAN", value: 0 }]))}` +
    `&access_token=${FB_ACCESS_TOKEN}`;

  const rows: InsightRow[] = [];

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Facebook Graph API failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    rows.push(...(json.data ?? []));
    url = json.paging?.next ?? "";
  }

  return rows.map((row) => ({
    date: row.date_start,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    spend: parseFloat(row.spend ?? "0") || 0,
    impressions: parseInt(row.impressions ?? "0", 10) || 0,
    clicks: parseInt(row.clicks ?? "0", 10) || 0,
    link_clicks: parseInt(row.inline_link_clicks ?? "0", 10) || 0,
    leads: Math.round(sumActionValue(row.actions, LEAD_ACTION_TYPES)),
    purchases: Math.round(sumActionValue(row.actions, PURCHASE_ACTION_TYPES)),
    purchase_value: sumActionValue(row.action_values, PURCHASE_ACTION_TYPES),
  }));
}
