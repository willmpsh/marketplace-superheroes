import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/sync-auth";
import {
  runActiveCampaignSync,
  runFacebookSync,
  runSheetsSync,
} from "@/lib/sync-runners";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Single combined entry point for Vercel Cron — the Hobby plan caps projects at
 * 2 cron jobs invoked at most once daily, so all three syncs run under one job
 * rather than one cron entry per source. Runs in parallel since each source
 * writes to its own table; one source failing (e.g. FB_ACCESS_TOKEN not yet
 * configured) doesn't block the others.
 */
export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const [activecampaign, facebook, sheets] = await Promise.allSettled([
    runActiveCampaignSync(),
    runFacebookSync(),
    runSheetsSync(),
  ]);

  const toResult = (settled: PromiseSettledResult<unknown>) =>
    settled.status === "fulfilled"
      ? { ok: true, ...(settled.value as object) }
      : {
          ok: false,
          error:
            settled.reason instanceof Error
              ? settled.reason.message
              : String(settled.reason),
        };

  return NextResponse.json({
    activecampaign: toResult(activecampaign),
    facebook: toResult(facebook),
    sheets: toResult(sheets),
  });
}
