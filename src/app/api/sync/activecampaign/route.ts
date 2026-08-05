import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/sync-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOfferIdBySlugMap, offerIdForName } from "@/lib/sync-helpers";
import {
  fetchSentCampaigns,
  fetchLists,
  computeCampaignStats,
} from "@/lib/activecampaign";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const offerIdBySlug = await getOfferIdBySlugMap();

  const campaigns = await fetchSentCampaigns();
  const campaignRows = campaigns
    .map(computeCampaignStats)
    .filter((row) => row.send_date) // skip campaigns without a send date
    .map((row) => ({
      ...row,
      offer_id: offerIdForName(row.campaign_name, offerIdBySlug),
    }));

  const { error: campaignError } = await supabase
    .from("ac_campaign_stats")
    .upsert(campaignRows, { onConflict: "campaign_id" });
  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  const lists = await fetchLists();
  const today = new Date().toISOString().slice(0, 10);
  const listRows = lists.map((list) => ({
    date: today,
    list_id: list.id,
    list_name: list.name,
    active_subscribers: parseInt(list.active_subscribers ?? "0", 10) || 0,
    non_deleted_subscribers: parseInt(list.non_deleted_subscribers ?? "0", 10) || 0,
  }));

  const { error: listError } = await supabase
    .from("ac_list_growth_daily")
    .upsert(listRows, { onConflict: "date,list_id" });
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    campaignsSynced: campaignRows.length,
    listsSynced: listRows.length,
  });
}
