import { subDays, format } from "date-fns";
import { EmptyState, StatTile } from "@/components/stat-tile";
import { getAcCampaignStatsSince, getAcListGrowthSince } from "@/lib/queries";

export const dynamic = "force-dynamic";

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}

export default async function EmailPage() {
  const sinceDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const [stats, listGrowth] = await Promise.all([
    getAcCampaignStatsSince(sinceDate),
    getAcListGrowthSince(sinceDate),
  ]);

  const totalSends = stats.reduce((sum, r) => sum + Number(r.sends), 0);
  const totalVerifiedOpens = stats.reduce(
    (sum, r) => sum + Number(r.verified_opens),
    0,
  );
  const totalClicks = stats.reduce((sum, r) => sum + Number(r.clicks), 0);
  const totalUnsubs = stats.reduce((sum, r) => sum + Number(r.unsubscribes), 0);
  const totalBounces = stats.reduce(
    (sum, r) => sum + Number(r.hard_bounces) + Number(r.soft_bounces),
    0,
  );

  const latestByList = new Map<string, (typeof listGrowth)[number]>();
  for (const row of listGrowth) {
    const existing = latestByList.get(row.list_id);
    if (!existing || row.date > existing.date) latestByList.set(row.list_id, row);
  }
  const listSnapshots = Array.from(latestByList.values()).sort(
    (a, b) => b.active_subscribers - a.active_subscribers,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Email (ActiveCampaign)
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Last 30 days
        </p>
      </div>

      {stats.length === 0 ? (
        <EmptyState message="No ActiveCampaign data synced yet. Run /api/sync/activecampaign to populate this page." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Sends" value={fmtNumber(totalSends)} />
            <StatTile
              label="Verified open rate"
              value={`${pct(totalVerifiedOpens, totalSends).toFixed(1)}%`}
            />
            <StatTile
              label="Click rate"
              value={`${pct(totalClicks, totalSends).toFixed(1)}%`}
            />
            <StatTile
              label="Unsubs / bounces"
              value={`${fmtNumber(totalUnsubs)} / ${fmtNumber(totalBounces)}`}
            />
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
                  <th className="px-4 py-3 font-medium">Send date</th>
                  <th className="px-4 py-3 font-medium">Sends</th>
                  <th className="px-4 py-3 font-medium">Verified opens</th>
                  <th className="px-4 py-3 font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {stats
                  .slice()
                  .sort((a, b) => b.send_date.localeCompare(a.send_date))
                  .map((s) => (
                    <tr
                      key={s.campaign_id}
                      className="border-b last:border-0"
                      style={{ borderColor: "var(--gridline)" }}
                    >
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {s.campaign_name}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {s.send_date}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {fmtNumber(s.sends)}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtNumber(s.verified_opens)} (
                        {pct(s.verified_opens, s.sends).toFixed(1)}%)
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtNumber(s.clicks)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {listSnapshots.length > 0 && (
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
                <th className="px-4 py-3 font-medium">List</th>
                <th className="px-4 py-3 font-medium">Active subscribers</th>
              </tr>
            </thead>
            <tbody>
              {listSnapshots.map((l) => (
                <tr
                  key={l.list_id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--gridline)" }}
                >
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                    {l.list_name}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {fmtNumber(l.active_subscribers)}
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
