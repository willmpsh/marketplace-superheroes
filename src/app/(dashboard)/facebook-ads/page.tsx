import { subDays, format } from "date-fns";
import { EmptyState, StatTile } from "@/components/stat-tile";
import { getFbInsightsSince } from "@/lib/queries";
import { SpendTrendChart } from "./spend-trend-chart";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export default async function FacebookAdsPage() {
  const sinceDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const insights = await getFbInsightsSince(sinceDate);

  const totalSpend = insights.reduce((sum, r) => sum + Number(r.spend), 0);
  const totalClicks = insights.reduce((sum, r) => sum + Number(r.clicks), 0);
  const totalLeads = insights.reduce((sum, r) => sum + Number(r.leads), 0);
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : null;

  const byDate = new Map<string, number>();
  for (const row of insights) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + Number(row.spend));
  }
  const trend = Array.from(byDate.entries())
    .map(([date, spend]) => ({ date, spend }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byCampaign = new Map<
    string,
    { name: string; spend: number; clicks: number; leads: number }
  >();
  for (const row of insights) {
    const existing = byCampaign.get(row.campaign_id) ?? {
      name: row.campaign_name,
      spend: 0,
      clicks: 0,
      leads: 0,
    };
    existing.spend += Number(row.spend);
    existing.clicks += Number(row.clicks);
    existing.leads += Number(row.leads);
    byCampaign.set(row.campaign_id, existing);
  }
  const campaigns = Array.from(byCampaign.values()).sort(
    (a, b) => b.spend - a.spend,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Facebook Ads
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Last 30 days — Essarr Limited (act_1882825839240)
        </p>
      </div>

      {insights.length === 0 ? (
        <EmptyState message="No Facebook Ads data synced yet. Run /api/sync/facebook once the Meta access token is configured." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Spend" value={fmtMoney(totalSpend)} />
            <StatTile label="Clicks" value={fmtNumber(totalClicks)} />
            <StatTile label="Leads" value={fmtNumber(totalLeads)} />
            <StatTile
              label="Cost per lead"
              value={cpl !== null ? fmtMoney(cpl) : "—"}
            />
          </div>

          <div
            className="rounded-lg border p-4"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-hairline)",
            }}
          >
            <h2
              className="mb-4 text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Daily spend
            </h2>
            <SpendTrendChart data={trend} />
          </div>

          <div
            className="overflow-x-auto rounded-lg border"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-hairline)",
            }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left text-xs"
                  style={{
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Spend</th>
                  <th className="px-4 py-3 font-medium">Clicks</th>
                  <th className="px-4 py-3 font-medium">Leads</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr
                    key={c.name}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--gridline)" }}
                  >
                    <td
                      className="px-4 py-3"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {c.name}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {fmtMoney(c.spend)}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {fmtNumber(c.clicks)}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {fmtNumber(c.leads)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
