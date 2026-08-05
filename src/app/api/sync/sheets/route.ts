import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/sync-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOfferIdBySlugMap } from "@/lib/sync-helpers";
import { fetchSheetValues } from "@/lib/google-sheets";
import { SHEET_SOURCES } from "@/lib/sheet-sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

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
      const rows = metrics.map((m) => ({
        offer_id: offerId,
        sheet_name: source.displayName,
        ...m,
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("sheet_metrics_daily")
          .upsert(rows, {
            onConflict: "offer_id,sheet_name,metric_date,dimension,metric_name",
          });
        if (error) throw error;
      }

      results[source.displayName] = rows.length;
    } catch (err) {
      results[source.displayName] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({ ok: true, results });
}
