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

/** Free-tier Gemini key from Google AI Studio (or GOOGLE_AI_API_KEY alias). */
export function getGeminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    undefined
  );
}

export function hasAnyAssistantKey(): boolean {
  return Boolean(getOpenAiKey() || getGeminiKey());
}

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
