import { createAdminClient } from "@/lib/supabase/admin";
import { inferOfferSlug } from "@/lib/offers";

export async function getOfferIdBySlugMap() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("offers").select("id, slug");
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
