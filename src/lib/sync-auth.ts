import { NextResponse } from "next/server";

/** Sync routes are hit by Vercel Cron and are excluded from user-auth in proxy.ts — gate them with a shared secret instead. */
export function requireCronSecret(request: Request): NextResponse | null {
  const expected = process.env.SYNC_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "SYNC_CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
