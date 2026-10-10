/**
 * Server-side Supabase client for FixitFelix.
 *
 * Uses the service role key — bypasses RLS for all operations.
 * This file must only be imported from server-side code (API routes, lib/store.ts).
 * NEVER import this from client components.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client configured with the service role key.
 * Throws if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set.
 */
export function getSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  cachedClient = createClient(url, key, {
    auth: {
      // Service role key doesn't need auth session management
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "x-client-info": "fixitfelix-server",
      },
    },
  });

  return cachedClient;
}

/**
 * Check if Supabase is configured (without throwing).
 * Used by store.ts to decide between Supabase and JSON file fallback.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return !!(url && key);
}
