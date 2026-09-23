import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/config/env";

export type ItineraSupabase = SupabaseClient;

export function createBrowserSupabaseClient(): ItineraSupabase | null {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/**
 * Server-side client using anon key only.
 * Share token resolution uses RPC get_shared_trip (security definer).
 * Never put service_role in NEXT_PUBLIC_* vars.
 */
export function createServerSupabaseClient(): ItineraSupabase | null {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseConfig());
}

const CLIENT_KEY = "itinera.client_owner_key.v1";

export function getOrCreateClientOwnerKey(): string {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem(CLIENT_KEY);
  if (!key || key.length < 16) {
    key = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(CLIENT_KEY, key);
  }
  return key;
}
