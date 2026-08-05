import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/sync-auth";
import { runSheetsSync } from "@/lib/sync-runners";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const results = await runSheetsSync();
  return NextResponse.json({ ok: true, results });
}
