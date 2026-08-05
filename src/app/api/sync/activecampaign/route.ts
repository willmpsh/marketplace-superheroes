import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/sync-auth";
import { runActiveCampaignSync } from "@/lib/sync-runners";
import { toErrorMessage } from "@/lib/sync-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const result = await runActiveCampaignSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: toErrorMessage(err) }, { status: 500 });
  }
}
