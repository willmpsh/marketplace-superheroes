import { NextResponse } from "next/server";

/**
 * Sync routes are hit by Vercel Cron (GET, auto-authenticated) and are excluded
 * from user-auth in proxy.ts. `CRON_SECRET` is Vercel's own convention — when an
 * env var of that exact name is set, Vercel automatically sends it as a Bearer
 * token on scheduled invocations. A `?secret=` query param is also accepted, for
 * manual/admin-triggered runs where setting a header isn't convenient.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  if (auth !== `Bearer ${expected}` && querySecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
