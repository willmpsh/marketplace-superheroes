import { createClient } from "@/lib/supabase/server";

export async function getOffers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select("id, slug, name")
    .order("name");
  if (error) throw error;
  return data;
}

export async function getFbInsightsSince(sinceDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fb_ad_insights_daily")
    .select(
      "date, campaign_id, campaign_name, offer_id, spend, impressions, clicks, leads, purchases, purchase_value",
    )
    .gte("date", sinceDate)
    .order("date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAcCampaignStatsSince(sinceDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ac_campaign_stats")
    .select(
      "campaign_id, campaign_name, offer_id, send_date, sends, raw_opens, verified_opens, clicks, unsubscribes, hard_bounces, soft_bounces",
    )
    .gte("send_date", sinceDate)
    .order("send_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAcListGrowthSince(sinceDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ac_list_growth_daily")
    .select("date, list_id, list_name, active_subscribers, non_deleted_subscribers")
    .gte("date", sinceDate)
    .order("date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getSheetMetricsSince(sinceDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sheet_metrics_daily")
    .select("offer_id, sheet_name, metric_date, dimension, metric_name, metric_value")
    .gte("metric_date", sinceDate)
    .order("metric_date", { ascending: true });
  if (error) throw error;
  return data;
}
