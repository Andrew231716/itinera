import type { PlaceRef, RoadPreferences, TravelMode } from "@/lib/types/trip";

const MODE_MAP: Record<TravelMode, string> = {
  DRIVE: "driving",
  WALK: "walking",
  BICYCLE: "bicycling",
  TRANSIT: "transit",
  TWO_WHEELER: "driving",
};

function encodePlace(place: PlaceRef): string {
  if (place.placeId && !place.placeId.startsWith("demo-")) {
    return `place_id:${place.placeId}`;
  }
  return `${place.location.lat},${place.location.lng}`;
}

export interface MapsLinkResult {
  url: string;
  /** Preferences actually represented in the URL */
  includedPreferences: string[];
  /** Features that could not be transferred */
  omitted: string[];
  /** True when waypoints exceed Maps URL practical limits */
  requiresSegmentation: boolean;
  segments?: string[];
}

const MAX_WAYPOINTS_IN_URL = 8;

/**
 * Builds a Google Maps Directions URL.
 * Custom exclusions cannot be represented in Maps URLs.
 */
export function buildGoogleMapsDirectionsLink(params: {
  origin: PlaceRef;
  destination: PlaceRef;
  stops: PlaceRef[];
  travelMode: TravelMode;
  preferences: RoadPreferences;
}): MapsLinkResult {
  const { origin, destination, stops, travelMode, preferences } = params;
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

  const requiresSegmentation = stops.length > MAX_WAYPOINTS_IN_URL;
  const waypointBatch = stops.slice(0, MAX_WAYPOINTS_IN_URL);

  if (requiresSegmentation) {
    omitted.push(
      `Troppe tappe (${stops.length}): il link include solo le prime ${MAX_WAYPOINTS_IN_URL}. Usa i segmenti per navigare il resto.`,
    );
  }

  const search = new URLSearchParams({
    api: "1",
    origin: encodePlace(origin),
    destination: encodePlace(destination),
    travelmode: MODE_MAP[travelMode],
  });

  if (waypointBatch.length > 0) {
    search.set("waypoints", waypointBatch.map(encodePlace).join("|"));
  }
  if (avoidParts.length > 0) {
    search.set("avoid", avoidParts.join("|"));
  }

  const url = `https://www.google.com/maps/dir/?${search.toString()}`;

  const segments: string[] = [];
  if (requiresSegmentation || stops.length > 0) {
    const chain = [origin, ...stops, destination];
    for (let i = 0; i < chain.length - 1; i++) {
      const s = new URLSearchParams({
        api: "1",
        origin: encodePlace(chain[i]),
        destination: encodePlace(chain[i + 1]),
        travelmode: MODE_MAP[travelMode],
      });
      if (avoidParts.length > 0) s.set("avoid", avoidParts.join("|"));
      segments.push(`https://www.google.com/maps/dir/?${s.toString()}`);
    }
  }

  return {
    url,
    includedPreferences,
    omitted,
    requiresSegmentation,
    segments: segments.length > 0 ? segments : undefined,
  };
}

export function buildShareTripUrl(tripId: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?trip=${encodeURIComponent(tripId)}`;
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
