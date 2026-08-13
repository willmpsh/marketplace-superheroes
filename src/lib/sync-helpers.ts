import { createAdminClient } from "@/lib/supabase/admin";
import { inferOfferSlug } from "@/lib/offers";

/**
 * The service-role key is a static JWT (not minted per-request, so we can't back-date
 * its iat like the Google Sheets JWT). When the signing time trails just past "now" on
 * Supabase's side, the very first admin-client call of a cold start can be rejected as
 * "JWT issued at future" — confirmed in production where sheets synced fine but the
 * concurrently-run AC/Facebook syncs (which hit this same call first) both failed with
 * that error. One retry after a short delay clears the skew window.
 */
export async function getOfferIdBySlugMap() {
  const supabase = createAdminClient();
  let { data, error } = await supabase.from("offers").select("id, slug");
  if (error) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    ({ data, error } = await supabase.from("offers").select("id, slug"));
  }
  if (error) throw error;

  const bySlug = new Map<string, string>();
  for (const offer of data) bySlug.set(offer.slug, offer.id);
  return bySlug;
}

export function offerIdForName(
  name: string,
  offerIdBySlug: Map<string, string>,
): string | null {
  const slug = inferOfferSlug(name);
  return offerIdBySlug.get(slug) ?? offerIdBySlug.get("other") ?? null;
}

/** Supabase/Postgrest errors are plain objects, not Error instances — String(err) on those yields "[object Object]". */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** Last-write-wins de-dupe by conflict key, since Postgres rejects an upsert batch that targets the same row twice ("ON CONFLICT DO UPDATE command cannot affect row a second time"). */
export function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyFn(row), row);
  return Array.from(byKey.values());
}
