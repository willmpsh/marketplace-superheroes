import { subDays, format } from "date-fns";
import { EmptyState } from "@/components/stat-tile";
import {
  getOffers,
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

export default async function OffersPage() {
  const sinceDate = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const [offers, fbInsights, acStats, sheetMetrics] = await Promise.all([
    getOffers(),
    getFbInsightsSince(sinceDate),
    getAcCampaignStatsSince(sinceDate),
    getSheetMetricsSince(sinceDate),
  ]);

  const rows = offers
    .map((offer) => {
      const spend = fbInsights
        .filter((r) => r.offer_id === offer.id)
        .reduce((sum, r) => sum + Number(r.spend), 0);
      const fbLeads = fbInsights
        .filter((r) => r.offer_id === offer.id)
        .reduce((sum, r) => sum + Number(r.leads), 0);
      const sheetLeads = sheetMetrics
        .filter((m) => m.offer_id === offer.id && m.metric_name === "leads")
        .reduce((sum, r) => sum + Number(r.metric_value), 0);
      const sends = acStats
        .filter((r) => r.offer_id === offer.id)
        .reduce((sum, r) => sum + Number(r.sends), 0);
      const verifiedOpens = acStats
        .filter((r) => r.offer_id === offer.id)
        .reduce((sum, r) => sum + Number(r.verified_opens), 0);
      const totalLeads = fbLeads + sheetLeads;
      const cpl = totalLeads > 0 ? spend / totalLeads : null;

      return {
        offer,
        spend,
        fbLeads,
        sheetLeads,
        totalLeads,
        cpl,
        sends,
        openRate: sends > 0 ? (verifiedOpens / sends) * 100 : null,
      };
    })
    .filter((r) => r.spend > 0 || r.totalLeads > 0 || r.sends > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Offers
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Last 30 days — spend, leads, and email performance per offer
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No offer-level data synced yet. This view fills in once the Facebook Ads, Sheets, and ActiveCampaign syncs have run." />
      ) : (
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
                <th className="px-4 py-3 font-medium">Offer</th>
                <th className="px-4 py-3 font-medium">Spend</th>
                <th className="px-4 py-3 font-medium">Leads</th>
                <th className="px-4 py-3 font-medium">CPL</th>
                <th className="px-4 py-3 font-medium">Email sends</th>
                <th className="px-4 py-3 font-medium">Verified open rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.offer.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--gridline)" }}
                >
                  <td
                    className="px-4 py-3 font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {r.offer.name}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                    {fmtMoney(r.spend)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                    {fmtNumber(r.totalLeads)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {r.cpl !== null ? fmtMoney(r.cpl) : "—"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                    {fmtNumber(r.sends)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {r.openRate !== null ? `${r.openRate.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
