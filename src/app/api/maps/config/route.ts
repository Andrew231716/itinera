import { NextResponse } from "next/server";
import {
  getBrowserGoogleMapsKey,
  getServerGoogleMapsKey,
  resolveMapsMode,
  resolveRoutingMode,
} from "@/lib/config/env";

export const runtime = "nodejs";

export async function GET() {
  const browserKey = getBrowserGoogleMapsKey() ?? null;
  // Never expose the server-only key to the client.
  const hasServerKey = Boolean(getServerGoogleMapsKey());

  return NextResponse.json({
    mapsMode: resolveMapsMode(),
    routingMode: resolveRoutingMode(),
    browserKey,
    hasServerKey,
    features: {
      places: hasServerKey || resolveMapsMode() === "demo",
      routing: hasServerKey || resolveRoutingMode() === "demo",
      mapDisplay: Boolean(browserKey),
    },
  });
}
