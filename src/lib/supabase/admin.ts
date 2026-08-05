import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-only sync routes. Bypasses RLS — never
 * import this into client components or expose SUPABASE_SERVICE_ROLE_KEY
 * to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
