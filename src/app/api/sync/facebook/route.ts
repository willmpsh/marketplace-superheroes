import { NextResponse } from "next/server";
import { subDays, format } from "date-fns";
import { requireCronSecret } from "@/lib/sync-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOfferIdBySlugMap, offerIdForName } from "@/lib/sync-helpers";
import { fetchDailyInsights } from "@/lib/facebook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const untilDate = format(new Date(), "yyyy-MM-dd");
  const sinceDate = format(subDays(new Date(), days), "yyyy-MM-dd");

  const supabase = createAdminClient();
  const offerIdBySlug = await getOfferIdBySlugMap();

  const insights = await fetchDailyInsights(sinceDate, untilDate);
  const rows = insights.map((row) => ({
    ...row,
    offer_id: offerIdForName(row.campaign_name, offerIdBySlug),
  }));

  const { error } = await supabase
    .from("fb_ad_insights_daily")
    .upsert(rows, { onConflict: "date,campaign_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rowsSynced: rows.length, sinceDate, untilDate });
}
