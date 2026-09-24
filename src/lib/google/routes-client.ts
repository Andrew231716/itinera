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
            units?: string;
            nanos?: number;
          }>;
        };
      }
    | undefined;

  const priceEntry = travelAdvisory?.tollInfo?.estimatedPrice?.[0];
  let tolls: ComputedRoute["tolls"];
  if (travelAdvisory?.tollInfo) {
    const units = priceEntry?.units ? Number(priceEntry.units) : undefined;
    const nanos = priceEntry?.nanos ? priceEntry.nanos / 1e9 : 0;
    tolls = {
      hasTolls: true,
      currencyCode: priceEntry?.currencyCode,
      estimatedPrice:
        units !== undefined && !Number.isNaN(units) ? units + nanos : undefined,
      notes: units === undefined ? "Pedaggi segnalati senza importo stimato." : undefined,
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

  if (request.departureAt) {
    body.departureTime = request.departureAt;
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
        ].join(","),
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    if (res.status === 429) {
      throw new AppError(
        "QUOTA",
        "Limite di utilizzo Routes API raggiunto.",
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
      "Impossibile calcolare il percorso con Google Routes.",
      res.status >= 500 ? 502 : 400,
    );
  }

  const data = (await res.json()) as {
    routes?: Array<Record<string, unknown>>;
  };

  const routes = (data.routes ?? []).map((r, i) =>
    mapGoogleRoute(r, i, waypointLabels, request.exclusions),
  );

  const limitations = [...mapped.limitations];

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

function toWaypoint(place: {
  location: LatLng;
  placeId?: string;
  label: string;
}): Record<string, unknown> {
  if (place.placeId && !place.placeId.startsWith("demo-")) {
    return { placeId: place.placeId };
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
