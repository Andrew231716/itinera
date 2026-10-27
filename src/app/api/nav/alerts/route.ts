import { NextResponse } from "next/server";
import type { LatLng } from "@/lib/types/trip";
import {
  bboxFromPoints,
  projectAlertsOntoRoute,
  samplePathPoints,
  type NavAlert,
} from "@/lib/navigation/alerts";
import { fetchOverpassAlerts } from "@/lib/osm/overpass-alerts";

function isLatLng(v: unknown): v is LatLng {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as LatLng).lat === "number" &&
    typeof (v as LatLng).lng === "number"
  );
}

function splitBbox(
  bbox: { south: number; west: number; north: number; east: number },
  maxSpanDeg = 0.35,
): Array<{ south: number; west: number; north: number; east: number }> {
  const latSpan = bbox.north - bbox.south;
  const lngSpan = bbox.east - bbox.west;
  if (latSpan <= maxSpanDeg && lngSpan <= maxSpanDeg) return [bbox];

  const midLat = (bbox.south + bbox.north) / 2;
  const midLng = (bbox.west + bbox.east) / 2;
  const parts = [
    { south: bbox.south, west: bbox.west, north: midLat, east: midLng },
    { south: bbox.south, west: midLng, north: midLat, east: bbox.east },
    { south: midLat, west: bbox.west, north: bbox.north, east: midLng },
    { south: midLat, west: midLng, north: bbox.north, east: bbox.east },
  ];
  return parts.flatMap((p) => splitBbox(p, maxSpanDeg)).slice(0, 8);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: unknown };
    const path = Array.isArray(body.path)
      ? body.path.filter(isLatLng).slice(0, 800)
      : [];
    if (path.length < 2) {
      return NextResponse.json(
        { error: "Serve un percorso con almeno 2 punti." },
        { status: 400 },
      );
    }

    const samples = samplePathPoints(path, 500);
    const full = bboxFromPoints(samples, 0.012);
    if (!full) {
      return NextResponse.json({
        alerts: [],
        speedLimitSamples: [],
        source: "none",
        attribution: "© OpenStreetMap contributors",
      });
    }

    const tiles = splitBbox(full);
    const alertMap = new Map<string, NavAlert>();
    const limitSamples: Array<{ location: LatLng; maxspeedKmh: number }> = [];

    for (const tile of tiles) {
      try {
        const result = await fetchOverpassAlerts(tile);
        for (const a of result.alerts) alertMap.set(a.id, a);
        limitSamples.push(...result.speedLimitSamples);
      } catch {
        // Continue with other tiles / partial data
      }
    }

    const projected = projectAlertsOntoRoute(
      [...alertMap.values()],
      path,
      140,
    );

    return NextResponse.json({
      alerts: projected,
      speedLimitSamples: limitSamples.slice(0, 400),
      source: projected.length || limitSamples.length ? "osm" : "none",
      attribution: "© OpenStreetMap contributors",
      tiles: tiles.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossibile caricare le segnalazioni.",
        alerts: [],
        speedLimitSamples: [],
        source: "none",
        attribution: "© OpenStreetMap contributors",
      },
      { status: 502 },
    );
  }
}
