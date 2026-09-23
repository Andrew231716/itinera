import { NextResponse } from "next/server";
import {
  getOpenAiKey,
  getServerGoogleMapsKey,
  getBrowserGoogleMapsKey,
  getSupabaseConfig,
  resolveMapsMode,
  resolveRoutingMode,
} from "@/lib/config/env";
import { listRoutingEngines } from "@/lib/routing/engines/types";

export const runtime = "nodejs";

export async function GET() {
  const browserKey = getBrowserGoogleMapsKey() ?? null;
  const hasServerKey = Boolean(getServerGoogleMapsKey());
  const supabase = Boolean(getSupabaseConfig());
  const openai = Boolean(getOpenAiKey());

  return NextResponse.json({
    mapsMode: resolveMapsMode(),
    routingMode: resolveRoutingMode(),
    browserKey,
    hasServerKey,
    features: {
      places: hasServerKey || resolveMapsMode() === "demo",
      routing: hasServerKey || resolveRoutingMode() === "demo",
      mapDisplay: Boolean(browserKey),
      supabase,
      openai,
    },
    engines: listRoutingEngines().map((e) => ({
      id: e.id,
      displayName: e.displayName,
      supportsNativeAvoidAreas: e.supportsNativeAvoidAreas,
      maxIntermediates: e.maxIntermediates,
    })),
  });
}
