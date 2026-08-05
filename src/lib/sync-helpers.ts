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
