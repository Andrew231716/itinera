import type {
  ComputedRoute,
  RouteComputeRequest,
  RouteComputeResponse,
  RouteLeg,
  RouteStep,
} from "@/lib/types/route";
import type { CustomExclusion, LatLng, PlaceRef, RoadPreferences } from "@/lib/types/trip";
import { AppError } from "@/lib/utils/errors";
import { decodePolyline } from "@/lib/utils/geometry";
import {
  checkRouteConstraintsDetailed,
  isRouteConformant,
} from "@/lib/routing/constraint-checker";
import { mapPreferencesToGoogle } from "@/lib/routing/preference-mapper";
import { detectMilanTrafficZones } from "@/lib/geo/milan-traffic-zones";

function parseDurationSeconds(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const m = value.match(/^(\d+)s$/);
    if (m) return Number(m[1]);
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function buildLegs(
  legs: Array<Record<string, unknown>> | undefined,
  waypoints: string[],
): RouteLeg[] {
  if (!legs?.length) return [];
  return legs.map((leg, i) => {
    const stepsRaw = (leg.steps as Array<Record<string, unknown>> | undefined) ?? [];
    const steps: RouteStep[] = stepsRaw.map((s, si) => ({
      id: `step-${i}-${si}`,
      instruction:
        (s.navigationInstruction as { instructions?: string } | undefined)
          ?.instructions ??
        (typeof s.instruction === "string" ? s.instruction : "Prosegui"),
      distanceMeters: Number(s.distanceMeters ?? 0),
      durationSeconds: parseDurationSeconds(s.staticDuration ?? s.duration),
      polyline: (s.polyline as { encodedPolyline?: string } | undefined)
        ?.encodedPolyline,
    }));

    return {
      id: `leg-${i}`,
      startLabel: waypoints[i] ?? `Punto ${i + 1}`,
      endLabel: waypoints[i + 1] ?? `Punto ${i + 2}`,
      distanceMeters: Number(leg.distanceMeters ?? 0),
      durationSeconds: parseDurationSeconds(leg.duration),
      staticDurationSeconds: parseDurationSeconds(leg.staticDuration),
      steps,
    };
  });
}

function mapGoogleRoute(
  route: Record<string, unknown>,
  index: number,
  waypointLabels: string[],
  exclusions: CustomExclusion[],
): ComputedRoute {
  const encoded =
    (route.polyline as { encodedPolyline?: string } | undefined)
      ?.encodedPolyline ?? "";
  const decodedPath = encoded ? decodePolyline(encoded) : [];
  const legs = buildLegs(
    route.legs as Array<Record<string, unknown>> | undefined,
    waypointLabels,
  );
  const distanceMeters = Number(route.distanceMeters ?? 0);
  const durationSeconds = parseDurationSeconds(route.duration);
  const staticDurationSeconds = parseDurationSeconds(route.staticDuration);

  const travelAdvisory = route.travelAdvisory as
    | {
        tollInfo?: {
          estimatedPrice?: Array<{
            currencyCode?: string;
            units?: string | number;
            nanos?: number;
          }>;
        };
      }
    | undefined;

  const priceEntries = travelAdvisory?.tollInfo?.estimatedPrice ?? [];
  let tolls: ComputedRoute["tolls"];
  if (travelAdvisory?.tollInfo) {
    // Sum amounts in the same currency when Google returns multiple Money values.
    const byCurrency = new Map<string, number>();
    for (const entry of priceEntries) {
      const unitsRaw = entry.units;
      const units =
        unitsRaw === undefined || unitsRaw === null || unitsRaw === ""
          ? undefined
          : Number(unitsRaw);
      if (units === undefined || Number.isNaN(units)) continue;
      const nanos = entry.nanos ? entry.nanos / 1e9 : 0;
      const code = entry.currencyCode ?? "EUR";
      byCurrency.set(code, (byCurrency.get(code) ?? 0) + units + nanos);
    }
    const firstCurrency = [...byCurrency.keys()][0];
    const total =
      firstCurrency !== undefined ? byCurrency.get(firstCurrency) : undefined;
    tolls = {
      hasTolls: true,
      currencyCode: firstCurrency,
      estimatedPrice: total,
      source: "google_routes",
      notes:
        total != null
          ? "Importo pedaggi da Google Routes (stima ufficiale del motore quando disponibile)."
          : "Pedaggi presenti sul percorso, ma Google non ha restituito l’importo. Controlla Autostrade per l’Italia / Telepass.",
    };
  }

  const warnings = Array.isArray(route.warnings)
    ? (route.warnings as string[])
    : [];

  const detailed = checkRouteConstraintsDetailed(decodedPath, exclusions);
  const isConformant = isRouteConformant(
    detailed.violations,
    detailed.unverifiable,
    exclusions,
  );
  const zoneAdvisories = detectMilanTrafficZones(decodedPath);

  return {
    id: `google-${index}`,
    label: index === 0 ? "Percorso consigliato" : `Alternativa ${index}`,
    distanceMeters,
    durationSeconds,
    staticDurationSeconds,
    polyline: encoded,
    decodedPath,
    legs,
    tolls,
    warnings,
    violations: detailed.violations,
    unverifiableConstraints: detailed.unverifiable,
    isConformant,
    zoneAdvisories,
    engine: "google_routes",
    rawDescription: (route.description as string | undefined) ?? undefined,
  };
}

/**
 * Demo response: never invents a navigable route.
 * Returns empty routes with an explicit limitation message.
 */
export function buildDemoRouteResponse(
  request: RouteComputeRequest,
): RouteComputeResponse {
  const limitations = [
    "Modalità demo attiva: nessuna chiave Google Routes configurata.",
    "Non vengono inventati percorsi, distanze o tempi di percorrenza.",
    "Configura GOOGLE_MAPS_API_KEY per calcolare itinerari reali.",
  ];

  if (request.exclusions.length > 0) {
    limitations.push(
      "Le esclusioni personalizzate richiedono un calcolo reale per essere verificate.",
    );
  }

  return {
    mode: "demo",
    routes: [],
    limitations,
  };
}

export async function computeRoutesWithGoogle(
  request: RouteComputeRequest,
  apiKey: string,
  fullPreferences?: RoadPreferences,
): Promise<RouteComputeResponse> {
  const mapped = mapPreferencesToGoogle(
    fullPreferences ?? {
      avoidTolls: request.preferences.avoidTolls,
      avoidHighways: request.preferences.avoidHighways,
      avoidFerries: request.preferences.avoidFerries,
      avoidTunnels: false,
      preferFastest: request.preferences.preferFastest,
      preferShortest: request.preferences.preferShortest,
      preferScenic: false,
      maxExtraMinutes: null,
    },
  );

  const waypointLabels = [
    request.origin.label,
    ...request.intermediates.map((p) => p.label),
    request.destination.label,
  ];

  const limitations = [...mapped.limitations];

  const body: Record<string, unknown> = {
    origin: toWaypoint(request.origin),
    destination: toWaypoint(request.destination),
    intermediates: request.intermediates.map(toWaypoint),
    travelMode: request.travelMode,
    routingPreference: mapped.routingPreference,
    computeAlternativeRoutes: true,
    languageCode: "it",
    units: "METRIC",
    extraComputations: ["TOLLS"],
    routeModifiers: mapped.routeModifiers,
    optimizeWaypointOrder: request.optimizeWaypointOrder,
  };

  if (mapped.requestedReferenceRoutes?.length) {
    body.requestedReferenceRoutes = mapped.requestedReferenceRoutes;
  }

  // Google requires departureTime in the future for TRAFFIC_AWARE_* modes.
  if (request.departureAt) {
    const ts = Date.parse(request.departureAt);
    if (!Number.isNaN(ts) && ts > Date.now() + 30_000) {
      body.departureTime = request.departureAt;
    } else {
      limitations.push(
        "Orario di partenza nel passato o non valido: calcolo con partenza «adesso».",
      );
    }
  }

  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "routes.duration",
          "routes.staticDuration",
          "routes.distanceMeters",
          "routes.polyline.encodedPolyline",
          "routes.description",
          "routes.warnings",
          "routes.legs.distanceMeters",
          "routes.legs.duration",
          "routes.legs.staticDuration",
          "routes.legs.steps.distanceMeters",
          "routes.legs.steps.staticDuration",
          "routes.legs.steps.navigationInstruction",
          "routes.legs.steps.polyline",
          "routes.travelAdvisory",
          "routes.optimizedIntermediateWaypointIndex",
          "routes.routeLabels",
        ].join(","),
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const googleMessage = await readGoogleErrorMessage(res);
    if (res.status === 429) {
      throw new AppError(
        "QUOTA",
        "Limite di utilizzo Routes API raggiunto. Riprova tra poco.",
        429,
      );
    }
    if (res.status === 403) {
      throw new AppError(
        "FORBIDDEN",
        "Accesso alle Routes API negato. Verifica chiave e billing Google Cloud.",
        403,
      );
    }
    throw new AppError(
      "ROUTES_ERROR",
      googleMessage
        ? `Google Routes: ${googleMessage}`
        : "Impossibile calcolare il percorso con Google Routes.",
      res.status >= 500 ? 502 : 400,
    );
  }

  const data = (await res.json()) as {
    routes?: Array<Record<string, unknown>>;
  };

  const routes = (data.routes ?? []).map((r, i) =>
    mapGoogleRoute(r, i, waypointLabels, request.exclusions),
  );

  const anyConformant = routes.some((r) => r.isConformant === true);
  const hardViolations = routes.flatMap((r) =>
    r.violations.filter((v) => v.severity === "hard"),
  );

  if (hardViolations.length > 0 && !anyConformant) {
    limitations.push(
      "Nessuna alternativa Google rispetta ancora i vincoli hard. Provo un percorso con deviazione automatica intorno alle zone escluse…",
    );
  } else if (hardViolations.length > 0) {
    limitations.push(
      "Alcune alternative attraversano zone da evitare: scegli un percorso senza badge «vincoli».",
    );
  }

  if (request.exclusions.some((e) => e.kind === "road" || e.kind === "road_segment")) {
    limitations.push(
      "Google Routes non supporta esclusioni stradali puntuali native: la verifica avviene sul percorso calcolato.",
    );
  }

  const optimized =
    (data.routes?.[0]?.optimizedIntermediateWaypointIndex as
      | number[]
      | undefined) ?? undefined;

  return {
    mode: "live",
    routes,
    optimizedIntermediateOrder: optimized,
    limitations,
  };
}

/** Exposed for detour retries from the routing engine. */
export function remapGoogleRoutesLabels(routes: ComputedRoute[]): ComputedRoute[] {
  return routes.map((r, i) => ({
    ...r,
    id: `google-${i}`,
    label: i === 0 ? "Percorso consigliato" : `Alternativa ${i}`,
  }));
}

export function placeRefFromLatLng(
  location: LatLng,
  label: string,
): PlaceRef {
  return {
    id: `via-${location.lat.toFixed(5)}-${location.lng.toFixed(5)}`,
    label,
    location,
    source: "manual",
  };
}

async function readGoogleErrorMessage(res: Response): Promise<string | null> {
  try {
    const payload = (await res.json()) as {
      error?: { message?: string; status?: string };
    };
    const message = payload.error?.message?.trim();
    if (!message) return null;
    // Keep user-facing text short and Italian-friendly for known cases.
    if (/Timestamp must be set to a future time/i.test(message)) {
      return "l’orario di partenza deve essere nel futuro.";
    }
    if (/Place ID .* is invalid/i.test(message)) {
      return "località non valida. Riscegli partenza/arrivo dalla ricerca.";
    }
    if (/Invalid value at 'routing_preference'/i.test(message)) {
      return "preferenza di percorso non supportata. Riprova con «più veloce».";
    }
    // Truncate very long Google messages
    return message.length > 160 ? `${message.slice(0, 157)}…` : message;
  } catch {
    return null;
  }
}

/** Normalize Places API (New) resource names to bare ChIJ… ids for Routes. */
export function normalizeRoutePlaceId(
  placeId: string | undefined,
): string | undefined {
  if (!placeId || placeId.startsWith("demo-")) return undefined;
  const bare = placeId.startsWith("places/")
    ? placeId.slice("places/".length)
    : placeId;
  if (!bare || bare.length < 8) return undefined;
  return bare;
}

function toWaypoint(place: {
  location: LatLng;
  placeId?: string;
  label: string;
}): Record<string, unknown> {
  const placeId = normalizeRoutePlaceId(place.placeId);
  // Prefer coordinates when available: more reliable than placeId across APIs.
  if (
    Number.isFinite(place.location.lat) &&
    Number.isFinite(place.location.lng)
  ) {
    return {
      location: {
        latLng: {
          latitude: place.location.lat,
          longitude: place.location.lng,
        },
      },
    };
  }
  if (placeId) {
    return { placeId };
  }
  return {
    location: {
      latLng: {
        latitude: place.location.lat,
        longitude: place.location.lng,
      },
    },
  };
}
