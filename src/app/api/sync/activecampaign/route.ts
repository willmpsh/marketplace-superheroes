import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/sync-auth";
import { runActiveCampaignSync } from "@/lib/sync-runners";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const result = await runActiveCampaignSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
