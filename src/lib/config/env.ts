/**
 * Server-side environment helpers.
 * Never import secret values into client components.
 */

export type AppMode = "live" | "demo";

export function getServerGoogleMapsKey(): string | undefined {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_ROUTES_API_KEY?.trim();
  return key || undefined;
}

export function getBrowserGoogleMapsKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();
  return key || undefined;
}

export function getOpenAiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

export type GeminiKeySource = "gemini" | "google_ai" | "maps_server";

/**
 * Gemini key resolution — end users never paste a key.
 *
 * Order:
 * 1. GEMINI_API_KEY (AI Studio / dedicated)
 * 2. GOOGLE_AI_API_KEY (alias)
 * 3. GOOGLE_MAPS_API_KEY / GOOGLE_ROUTES_API_KEY — same Google Cloud project
 *    (requires Generative Language API enabled; no second key to create)
 */
export function getGeminiKeySource(): GeminiKeySource | undefined {
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.GOOGLE_AI_API_KEY?.trim()) return "google_ai";
  if (getServerGoogleMapsKey()) return "maps_server";
  return undefined;
}

export function getGeminiKey(): string | undefined {
  const dedicated =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim();
  if (dedicated) return dedicated;
  return getServerGoogleMapsKey();
}

export function hasAnyAssistantKey(): boolean {
  return Boolean(getOpenAiKey() || getGeminiKey());
}

/** Console deep-link to enable Gemini on the existing Maps project (no new key). */
export const GEMINI_ENABLE_API_URL =
  "https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=itinera-509522";


export function getSupabaseConfig():
  | { url: string; anonKey: string }
  | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return undefined;
  return { url, anonKey };
}

export function resolveMapsMode(): AppMode {
  return getServerGoogleMapsKey() || getBrowserGoogleMapsKey()
    ? "live"
    : "demo";
}

export function resolveRoutingMode(): AppMode {
  return getServerGoogleMapsKey() ? "live" : "demo";
}
