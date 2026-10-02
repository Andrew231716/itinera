import type { LatLng, PlaceRef, RoadPreferences, TravelMode } from "@/lib/types/trip";
import { haversineMeters } from "@/lib/utils/geometry";

const MODE_MAP: Record<TravelMode, string> = {
  DRIVE: "driving",
  WALK: "walking",
  BICYCLE: "bicycling",
  TRANSIT: "transit",
  TWO_WHEELER: "driving",
};

/** Strip Places API (New) resource prefix; Maps URLs want bare ChIJ… ids. */
export function normalizeMapsPlaceId(
  placeId: string | undefined,
): string | undefined {
  if (!placeId) return undefined;
  if (placeId.startsWith("demo-")) return undefined;
  const bare = placeId.startsWith("places/")
    ? placeId.slice("places/".length)
    : placeId;
  // Classic Place IDs are stable; reject empty / obviously invalid
  if (!bare || bare.length < 8) return undefined;
  return bare;
}

/** Lat,lng — most reliable on mobile Maps apps (avoids place_id: hang). */
function encodeLatLng(place: PlaceRef): string {
  const lat = Number(place.location.lat);
  const lng = Number(place.location.lng);
  // Trim precision for shorter, more portable URLs
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export interface MapsLinkResult {
  url: string;
  includedPreferences: string[];
  omitted: string[];
  requiresSegmentation: boolean;
  /** True when URL embeds sampled geometry of the Itinera-selected route */
  lockedToItineraRoute: boolean;
  /** Label of the Itinera route being opened, when known */
  routeLabel?: string;
  shapeWaypointCount: number;
  segments?: Array<{
    index: number;
    label: string;
    url: string;
    from: string;
    to: string;
  }>;
  preview: {
    origin: string;
    destination: string;
    stops: string[];
    travelMode: string;
    note: string;
  };
}

/** Google Maps Directions URLs accept up to 10 waypoints; stay at 9 for safety. */
export const MAX_WAYPOINTS_IN_URL = 9;

/**
 * Sample intermediate points along a decoded route so Maps follows Itinera’s
 * chosen geometry as closely as the Directions URL API allows (no polyline param).
 * Samples by distance along the path (not by index) for better shape fidelity.
 */
export function sampleRoutePathAsWaypoints(
  path: LatLng[],
  maxWaypoints = MAX_WAYPOINTS_IN_URL,
): PlaceRef[] {
  if (path.length < 3 || maxWaypoints <= 0) return [];

  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(path[i - 1], path[i]));
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return [];

  function pointAtDistance(target: number): LatLng {
    if (target <= 0) return path[0];
    if (target >= total) return path[path.length - 1];
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    const prev = path[i - 1];
    const next = path[i];
    const segStart = cum[i - 1];
    const segLen = cum[i] - segStart;
    const t = segLen > 0 ? (target - segStart) / segLen : 0;
    return {
      lat: prev.lat + (next.lat - prev.lat) * t,
      lng: prev.lng + (next.lng - prev.lng) * t,
    };
  }

  const out: PlaceRef[] = [];
  for (let i = 0; i < maxWaypoints; i++) {
    const target = ((i + 1) / (maxWaypoints + 1)) * total;
    // Keep samples off the absolute endpoints
    const clamped = Math.min(total * 0.98, Math.max(total * 0.02, target));
    const p = pointAtDistance(clamped);
    out.push({
      id: `shape-${i}`,
      label: `Punto percorso ${i + 1}`,
      location: p,
      source: "manual",
    });
  }

  // Deduplicate consecutive identical samples
  return out.filter((p, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1].location;
    return (
      Math.abs(prev.lat - p.location.lat) > 1e-5 ||
      Math.abs(prev.lng - p.location.lng) > 1e-5
    );
  });
}

function buildDirSearchParams(params: {
  origin: PlaceRef;
  destination: PlaceRef;
  waypoints: PlaceRef[];
  travelMode: TravelMode;
  avoidParts: string[];
}): URLSearchParams {
  const { origin, destination, waypoints, travelMode, avoidParts } = params;

  // Always use coordinates for origin/destination values.
  // The old `place_id:…` form (and label-only values) often hang forever
  // in the Google Maps mobile app.
  const search = new URLSearchParams({
    api: "1",
    origin: encodeLatLng(origin),
    destination: encodeLatLng(destination),
    travelmode: MODE_MAP[travelMode],
  });

  const originPid = normalizeMapsPlaceId(origin.placeId);
  const destPid = normalizeMapsPlaceId(destination.placeId);
  if (originPid) search.set("origin_place_id", originPid);
  if (destPid) search.set("destination_place_id", destPid);

  if (waypoints.length > 0) {
    const waypointPids = waypoints.map((w) => normalizeMapsPlaceId(w.placeId));
    const allHavePid = waypointPids.every(Boolean);

    // Coordinates are the reliable waypoint values on mobile.
    // For sampled geometry waypoints (ids like `shape-0`) try to mark them as
    // pass-through (`via:`) so Maps is more likely to follow the shape instead
    // of recalculating a generic A→B route. This is a best-effort; Maps may
    // still adjust due to live traffic or internal heuristics.
    const waypointStrings = waypoints.map((w) => {
      const coord = encodeLatLng(w);
      // Treat synthetic shape waypoints as via: to hint Maps to pass through them.
      if (w.id && w.id.startsWith("shape-")) return `via:${coord}`;
      return coord;
    });

    search.set("waypoints", waypointStrings.join("|"));
    if (allHavePid) {
      // Only include place IDs when every waypoint has one — mixing can hang on
      // some mobile clients.
      search.set("waypoint_place_ids", waypointPids.join("|"));
    }
  }

  if (avoidParts.length > 0) {
    search.set("avoid", avoidParts.join("|"));
  }

  return search;
}

/**
 * Builds a Google Maps Directions URL.
 * Custom exclusions cannot be represented in Maps URLs.
 *
 * When `routePath` (decoded geometry of the selected Itinera route) is provided,
 * intermediate waypoints are sampled from that path so Maps opens closer to the
 * chosen alternative instead of recalculating a generic A→B route.
 */
export function buildGoogleMapsDirectionsLink(params: {
  origin: PlaceRef;
  destination: PlaceRef;
  stops: PlaceRef[];
  travelMode: TravelMode;
  preferences: RoadPreferences;
  /** Decoded polyline of the route selected in Itinera */
  routePath?: LatLng[];
  /** Label of the selected Itinera route (for preview / UX) */
  routeLabel?: string;
}): MapsLinkResult {
  const {
    origin,
    destination,
    stops,
    travelMode,
    preferences,
    routePath,
    routeLabel,
  } = params;
  const omitted: string[] = [
    "Esclusioni personalizzate (città, strade, zone) non trasferibili nel link Google Maps.",
  ];
  const includedPreferences: string[] = [];

  const avoidParts: string[] = [];
  if (preferences.avoidTolls) {
    avoidParts.push("tolls");
    includedPreferences.push("Evita pedaggi");
  }
  if (preferences.avoidHighways) {
    avoidParts.push("highways");
    includedPreferences.push("Evita autostrade");
  }
  if (preferences.avoidFerries) {
    avoidParts.push("ferries");
    includedPreferences.push("Evita traghetti");
  }

  if (preferences.avoidTunnels) {
    omitted.push("Evita tunnel non supportato dai link Google Maps.");
  }
  if (preferences.preferScenic) {
    omitted.push("Preferenza panoramica non rappresentabile nel link.");
  }
  if (preferences.maxExtraMinutes != null) {
    omitted.push("Limite di tempo extra non rappresentabile nel link.");
  }
  if (preferences.preferShortest) {
    omitted.push(
      "Preferenza percorso più breve non garantita dal link Directions.",
    );
  }

  const shapeWaypoints = routePath?.length
    ? sampleRoutePathAsWaypoints(routePath, MAX_WAYPOINTS_IN_URL)
    : [];
  const usingShape = shapeWaypoints.length > 0;

  let waypointBatch: PlaceRef[];
  let requiresSegmentation = false;

  if (usingShape) {
    // Prefer geometry of the selected Itinera route over free-form stop list.
    // The polyline already passes through planned stops.
    waypointBatch = shapeWaypoints;
    omitted.push(
      "Il link include punti intermedi del percorso scelto in Itinera per avvicinare Maps a quell’alternativa (Maps non accetta la polyline completa).",
    );
  } else {
    requiresSegmentation = stops.length > MAX_WAYPOINTS_IN_URL;
    waypointBatch = stops.slice(0, MAX_WAYPOINTS_IN_URL);
    if (requiresSegmentation) {
      omitted.push(
        `Troppe tappe (${stops.length}): il link principale include solo le prime ${MAX_WAYPOINTS_IN_URL}. Usa i segmenti per navigare il resto — nessuna tappa viene eliminata silenziosamente.`,
      );
    }
  }

  const search = buildDirSearchParams({
    origin,
    destination,
    waypoints: waypointBatch,
    travelMode,
    avoidParts,
  });

  const url = `https://www.google.com/maps/dir/?${search.toString()}`;

  const chain = [origin, ...stops, destination];
  const segments =
    !usingShape && chain.length > 1
      ? chain.slice(0, -1).map((from, i) => {
          const to = chain[i + 1];
          const s = buildDirSearchParams({
            origin: from,
            destination: to,
            waypoints: [],
            travelMode,
            avoidParts,
          });
          return {
            index: i + 1,
            label: `Tratta ${i + 1}`,
            from: from.label,
            to: to.label,
            url: `https://www.google.com/maps/dir/?${s.toString()}`,
          };
        })
      : undefined;

  return {
    url,
    includedPreferences,
    omitted,
    requiresSegmentation,
    lockedToItineraRoute: usingShape,
    routeLabel,
    shapeWaypointCount: usingShape ? shapeWaypoints.length : 0,
    segments,
    preview: {
      origin: origin.label,
      destination: destination.label,
      stops: usingShape
        ? [
            `${shapeWaypoints.length} punti del percorso Itinera${
              routeLabel ? ` «${routeLabel}»` : ""
            }`,
          ]
        : stops.map((s) => s.label),
      travelMode: MODE_MAP[travelMode],
      note: usingShape
        ? `Apre Maps sul percorso selezionato in Itinera${
            routeLabel ? ` (${routeLabel})` : ""
          } tramite ${shapeWaypoints.length} punti intermedi.`
        : requiresSegmentation
          ? "Il viaggio richiede navigazione a segmenti."
          : "Il link include l’itinerario completo supportato da Maps.",
    },
  };
}

export function buildShareTripUrl(tripId: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?trip=${encodeURIComponent(tripId)}`;
}

export function buildPublicShareUrl(token: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/share/${encodeURIComponent(token)}`;
}

export function exportStopsList(params: {
  title: string;
  origin: PlaceRef | null;
  destination: PlaceRef | null;
  stops: PlaceRef[];
}): string {
  const lines: string[] = [params.title, ""];
  if (params.origin) lines.push(`Partenza: ${params.origin.label}`);
  params.stops.forEach((s, i) => {
    lines.push(`Tappa ${i + 1}: ${s.label}`);
  });
  if (params.destination) lines.push(`Arrivo: ${params.destination.label}`);
  return lines.join("\n");
}

export function exportDirectionsText(
  legs: Array<{
    startLabel: string;
    endLabel: string;
    steps: Array<{ instruction: string; distanceMeters: number }>;
  }>,
): string {
  if (legs.length === 0) {
    return "Nessuna indicazione disponibile. Calcola prima un percorso reale.";
  }
  const parts: string[] = [];
  legs.forEach((leg, i) => {
    parts.push(`Tratta ${i + 1}: ${leg.startLabel} → ${leg.endLabel}`);
    leg.steps.forEach((step, si) => {
      parts.push(`  ${si + 1}. ${step.instruction}`);
    });
    parts.push("");
  });
  return parts.join("\n");
}

/**
 * Open a Maps directions URL in a mobile-friendly way.
 * Avoids some PWA/in-app-browser cases where target=_blank never handoffs.
 */
export function openMapsDirectionsUrl(url: string): void {
  if (typeof window === "undefined") return;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari "Add to Home Screen"
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  if (isStandalone) {
    // Same-tab navigation hands off to the Maps app more reliably from PWAs
    window.location.assign(url);
    return;
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(url);
  }
}

export async function nativeShare(payload: {
  title: string;
  text: string;
  url: string;
}): Promise<"shared" | "copied" | "unsupported"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return "shared";
    } catch {
      // user cancelled or share failed — fall through
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.url);
    return "copied";
  }
  return "unsupported";
}
