import { subDays, format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOfferIdBySlugMap,
  offerIdForName,
  toErrorMessage,
  dedupeByKey,
} from "@/lib/sync-helpers";
import {
  fetchSentCampaigns,
  fetchLists,
  computeCampaignStats,
} from "@/lib/activecampaign";
import { fetchDailyInsights } from "@/lib/facebook";
import { fetchSheetValues } from "@/lib/google-sheets";
import { SHEET_SOURCES } from "@/lib/sheet-sources";

export async function runActiveCampaignSync() {
  const supabase = createAdminClient();
  const offerIdBySlug = await getOfferIdBySlugMap();

  const campaigns = await fetchSentCampaigns();
  const campaignRowsRaw = campaigns
    .map(computeCampaignStats)
    .filter((row) => row.send_date)
    .map((row) => ({
      ...row,
      offer_id: offerIdForName(row.campaign_name, offerIdBySlug),
    }));
  // AC pagination can return the same campaign on two pages if results shift
  // mid-fetch; Postgres rejects an upsert batch that targets one row twice.
  const campaignRows = dedupeByKey(campaignRowsRaw, (r) => r.campaign_id);

  const { error: campaignError } = await supabase
    .from("ac_campaign_stats")
    .upsert(campaignRows, { onConflict: "campaign_id" });
  if (campaignError) throw new Error(toErrorMessage(campaignError));

  const lists = await fetchLists();
  const today = new Date().toISOString().slice(0, 10);
  const listRowsRaw = lists.map((list) => ({
    date: today,
    list_id: list.id,
    list_name: list.name,
    active_subscribers: parseInt(list.active_subscribers ?? "0", 10) || 0,
    non_deleted_subscribers: parseInt(list.non_deleted_subscribers ?? "0", 10) || 0,
  }));
  const listRows = dedupeByKey(listRowsRaw, (r) => `${r.date}|${r.list_id}`);

  const { error: listError } = await supabase
    .from("ac_list_growth_daily")
    .upsert(listRows, { onConflict: "date,list_id" });
  if (listError) throw new Error(toErrorMessage(listError));

  return { campaignsSynced: campaignRows.length, listsSynced: listRows.length };
}

export async function runFacebookSync(days = 30) {
  const supabase = createAdminClient();
  const offerIdBySlug = await getOfferIdBySlugMap();

  const untilDate = format(new Date(), "yyyy-MM-dd");
  const sinceDate = format(subDays(new Date(), days), "yyyy-MM-dd");

  const insights = await fetchDailyInsights(sinceDate, untilDate);
  const rowsRaw = insights.map((row) => ({
    ...row,
    offer_id: offerIdForName(row.campaign_name, offerIdBySlug),
  }));
  const rows = dedupeByKey(rowsRaw, (r) => `${r.date}|${r.campaign_id}`);

  const { error } = await supabase
    .from("fb_ad_insights_daily")
    .upsert(rows, { onConflict: "date,campaign_id" });
  if (error) throw new Error(toErrorMessage(error));

  return { rowsSynced: rows.length, sinceDate, untilDate };
}

export async function runSheetsSync() {
  const supabase = createAdminClient();
  const offerIdBySlug = await getOfferIdBySlugMap();

  const results: Record<string, number | string> = {};

  for (const source of SHEET_SOURCES) {
    const offerId = offerIdBySlug.get(source.offerSlug);
    if (!offerId) {
      results[source.displayName] = `skipped: unknown offer slug "${source.offerSlug}"`;
      continue;
    }

    try {
      const rawRows = await fetchSheetValues(source.spreadsheetId, source.range);
      const metrics = source.parse(rawRows);
      const rowsRaw = metrics.map((m) => ({
        offer_id: offerId,
        sheet_name: source.displayName,
        ...m,
      }));
      const rows = dedupeByKey(
        rowsRaw,
        (r) => `${r.offer_id}|${r.sheet_name}|${r.metric_date}|${r.dimension}|${r.metric_name}`,
      );

      if (rows.length > 0) {
        const { error } = await supabase
          .from("sheet_metrics_daily")
          .upsert(rows, {
            onConflict: "offer_id,sheet_name,metric_date,dimension,metric_name",
          });
        if (error) throw new Error(toErrorMessage(error));
      }

      results[source.displayName] = rows.length;
    } catch (err) {
      results[source.displayName] = `error: ${toErrorMessage(err)}`;
    }
  }

  return results;
}
