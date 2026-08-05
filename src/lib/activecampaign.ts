const AC_API_KEY = process.env.AC_API_KEY!;
const AC_API_URL = (process.env.AC_API_URL ?? "").replace(/\/$/, "");

async function acGet<T>(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${AC_API_URL}/api/3${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    headers: { "Api-Token": AC_API_KEY, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ActiveCampaign ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type AcCampaign = {
  id: string;
  name: string;
  sdate: string;
  status: string;
  send_amt?: string;
  total_amt?: string;
  uniqueopens?: string;
  verified_unique_opens?: string;
  uniquelinkclicks?: string;
  unsubscribes?: string;
  hardbounces?: string;
  softbounces?: string;
};

/** Mirrors scripts/daily_email_report.py::fetch_campaigns_for_dates, but bounded by max pages instead of a date filter. */
export async function fetchSentCampaigns(maxPages = 20) {
  const limit = 100;
  let offset = 0;
  const collected: AcCampaign[] = [];

  for (let page = 0; page < maxPages; page++) {
    const data = await acGet<{ campaigns: AcCampaign[] }>("/campaigns", {
      status: 5, // sent
      "orders[sdate]": "DESC",
      limit,
      offset,
    });
    const batch = data.campaigns ?? [];
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return collected;
}

export type AcList = {
  id: string;
  name: string;
  active_subscribers?: string;
  non_deleted_subscribers?: string;
};

export async function fetchLists(maxPages = 10) {
  const limit = 100;
  let offset = 0;
  const collected: AcList[] = [];

  for (let page = 0; page < maxPages; page++) {
    const data = await acGet<{ lists: AcList[] }>("/lists", { limit, offset });
    const batch = data.lists ?? [];
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return collected;
}

function safeInt(v: string | undefined) {
  const n = parseInt(v ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

/** Mirrors scripts/daily_email_report.py::compute_stats. */
export function computeCampaignStats(campaign: AcCampaign) {
  return {
    campaign_id: campaign.id,
    campaign_name: campaign.name || "Unnamed Campaign",
    send_date: (campaign.sdate || "").slice(0, 10),
    sends: safeInt(campaign.total_amt),
    raw_opens: safeInt(campaign.uniqueopens),
    verified_opens: safeInt(campaign.verified_unique_opens),
    clicks: safeInt(campaign.uniquelinkclicks),
    unsubscribes: safeInt(campaign.unsubscribes),
    hard_bounces: safeInt(campaign.hardbounces),
    soft_bounces: safeInt(campaign.softbounces),
  };
}
