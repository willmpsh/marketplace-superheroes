import { subDays, format } from "date-fns";
import { StatTile, EmptyState } from "@/components/stat-tile";
import {
  getFbInsightsSince,
  getAcCampaignStatsSince,
  getSheetMetricsSince,
} from "@/lib/queries";

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

export default async function OverviewPage() {
  const sinceDate = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const [fbInsights, acStats, sheetMetrics] = await Promise.all([
    getFbInsightsSince(sinceDate),
    getAcCampaignStatsSince(sinceDate),
    getSheetMetricsSince(sinceDate),
  ]);

  const totalSpend = fbInsights.reduce((sum, r) => sum + Number(r.spend), 0);
  const totalClicks = fbInsights.reduce((sum, r) => sum + Number(r.clicks), 0);
  const totalFbLeads = fbInsights.reduce((sum, r) => sum + Number(r.leads), 0);

  const totalSends = acStats.reduce((sum, r) => sum + Number(r.sends), 0);
  const totalVerifiedOpens = acStats.reduce(
    (sum, r) => sum + Number(r.verified_opens),
    0,
  );
  const openRate = totalSends > 0 ? (totalVerifiedOpens / totalSends) * 100 : 0;

  const sheetLeads = sheetMetrics
    .filter((m) => m.metric_name === "leads")
    .reduce((sum, r) => sum + Number(r.metric_value), 0);

  const hasAnyData =
    fbInsights.length > 0 || acStats.length > 0 || sheetMetrics.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Overview
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Last 30 days, across all offers
        </p>
      </div>

      {!hasAnyData && (
        <EmptyState message="No data synced yet. Once the Facebook Ads, ActiveCampaign, and Google Sheets syncs run, this page fills in automatically." />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Ad spend" value={fmtMoney(totalSpend)} />
        <StatTile label="Ad clicks" value={fmtNumber(totalClicks)} />
        <StatTile label="FB leads" value={fmtNumber(totalFbLeads)} />
        <StatTile label="Sheet-tracked leads" value={fmtNumber(sheetLeads)} />
        <StatTile
          label="Email verified open rate"
          value={`${openRate.toFixed(1)}%`}
          sublabel={`${fmtNumber(totalSends)} sends`}
        />
      </div>
    </div>
  );
}
