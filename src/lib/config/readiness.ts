import {
  getBrowserGoogleMapsKey,
  getOpenAiKey,
  getServerGoogleMapsKey,
  getSupabaseConfig,
  resolveMapsMode,
  resolveRoutingMode,
} from "@/lib/config/env";
import { listRoutingEngines } from "@/lib/routing/engines/types";

export type ServiceReadiness = {
  id: string;
  label: string;
  status: "ready" | "missing" | "partial" | "optional";
  message: string;
  envVars: string[];
};

export function getLiveReadiness(): {
  isLiveCapable: boolean;
  mapsMode: "live" | "demo";
  routingMode: "live" | "demo";
  services: ServiceReadiness[];
  nextSteps: string[];
} {
  const hasServerKey = Boolean(getServerGoogleMapsKey());
  const hasBrowserKey = Boolean(getBrowserGoogleMapsKey());
  const hasOpenAi = Boolean(getOpenAiKey());
  const hasSupabase = Boolean(getSupabaseConfig());

  const services: ServiceReadiness[] = [
    {
      id: "google_server",
      label: "Google Places + Routes (server)",
      status: hasServerKey ? "ready" : "missing",
      message: hasServerKey
        ? "Chiave server presente. Routing e Places live disponibili."
        : "Manca GOOGLE_MAPS_API_KEY. Senza di essa Places/Routes restano in demo.",
      envVars: ["GOOGLE_MAPS_API_KEY"],
    },
    {
      id: "google_browser",
      label: "Google Maps JavaScript (browser)",
      status: hasBrowserKey ? "ready" : "missing",
      message: hasBrowserKey
        ? "Chiave browser presente. Mappa interattiva disponibile."
        : "Manca NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY. Verrà usata la mappa illustrativa.",
      envVars: ["NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY"],
    },
    {
      id: "openai",
      label: "Assistente OpenAI",
      status: hasOpenAi ? "ready" : "optional",
      message: hasOpenAi
        ? "OPENAI_API_KEY presente."
        : "Opzionale. Senza chiave l’assistente resta unavailable.",
      envVars: ["OPENAI_API_KEY"],
    },
    {
      id: "supabase",
      label: "Supabase (persistenza cloud)",
      status: hasSupabase ? "ready" : "optional",
      message: hasSupabase
        ? "Supabase configurato. Esegui la migration SQL se non già applicata."
        : "Opzionale. Senza di esso resta solo localStorage.",
      envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    },
  ];

  const nextSteps: string[] = [];
  if (!hasServerKey) {
    nextSteps.push(
      "Crea una API key Google Cloud (Places API New + Routes API) e impostala in GOOGLE_MAPS_API_KEY.",
    );
  }
  if (!hasBrowserKey) {
    nextSteps.push(
      "Crea una API key browser con restrizione HTTP referrer e impostala in NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY.",
    );
  }
  if (!hasOpenAi) {
    nextSteps.push(
      "Per l’assistente: aggiungi OPENAI_API_KEY (modello default gpt-4o-mini).",
    );
  }
  if (!hasSupabase) {
    nextSteps.push(
      "Per cloud share/sync: crea progetto Supabase, applica supabase/migrations/001_itinera_trips.sql, imposta URL e anon key.",
    );
  }
  if (hasServerKey && hasBrowserKey) {
    nextSteps.push(
      "Riavvia `npm run dev` dopo aver salvato .env.local, poi testa un percorso reale (es. Milano → Roma).",
    );
  }

  return {
    isLiveCapable: hasServerKey && hasBrowserKey,
    mapsMode: resolveMapsMode(),
    routingMode: resolveRoutingMode(),
    services,
    nextSteps,
  };
}

export function getPublicConfigPayload() {
  const readiness = getLiveReadiness();
  const browserKey = getBrowserGoogleMapsKey() ?? null;
  const hasServerKey = Boolean(getServerGoogleMapsKey());

  return {
    mapsMode: readiness.mapsMode,
    routingMode: readiness.routingMode,
    browserKey,
    hasServerKey,
    isLiveCapable: readiness.isLiveCapable,
    features: {
      places: hasServerKey || readiness.mapsMode === "demo",
      routing: hasServerKey || readiness.routingMode === "demo",
      mapDisplay: Boolean(browserKey),
      supabase: Boolean(getSupabaseConfig()),
      openai: Boolean(getOpenAiKey()),
    },
    readiness: {
      services: readiness.services,
      nextSteps: readiness.nextSteps,
    },
    engines: listRoutingEngines().map((e) => ({
      id: e.id,
      displayName: e.displayName,
      supportsNativeAvoidAreas: e.supportsNativeAvoidAreas,
      maxIntermediates: e.maxIntermediates,
    })),
  };
}
