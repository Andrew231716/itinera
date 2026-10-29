import { haversineMeters } from "@/lib/utils/geometry";
import { formatDistance, formatDuration } from "@/lib/utils/format";
import type { RouteLeg } from "@/lib/types/route";
import type { PlaceRef } from "@/lib/types/trip";

/** Lock a visit in the sequence: free, fixed 1-based index, or always last. */
export type GiroPositionLock = "auto" | "last" | number;

export type GiroStop = {
  /** Stable UI / schedule id */
  id: string;
  place: PlaceRef;
  /** Optional desired arrival (ISO) */
  arriveBy: string | null;
  /** Where this stop must sit in the visit order */
  positionLock: GiroPositionLock;
};

export type ScheduleStop = {
  kind: "origin" | "stop" | "destination";
  place: PlaceRef;
  giroStopId?: string;
  /** ISO arrival (for origin = departure time) */
  arrivalAt: string;
  /** Travel time from the previous point (0 for origin) */
  legFromPreviousSeconds: number;
  /** Distance from the previous point in meters (0 for origin) */
  legFromPreviousMeters: number;
  cumulativeSeconds: number;
  /** Optional appointment the user set */
  arriveBy?: string | null;
  /** estimated − target (positive = late), seconds */
  vsArriveBySeconds?: number | null;
  /** True when duration came from haversine estimate, not the router */
  legEstimated?: boolean;
};

/**
 * Greedy nearest-neighbor order from a fixed start through all places.
 */
export function orderPlacesByNearestNeighbor(
  origin: PlaceRef,
  places: PlaceRef[],
): PlaceRef[] {
  const remaining = [...places];
  const ordered: PlaceRef[] = [];
  let current = origin.location;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(current, remaining[i].location);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = next.location;
  }

  return ordered;
}

function pickNearest(
  from: { lat: number; lng: number },
  candidates: GiroStop[],
): { stop: GiroStop; index: number } {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < candidates.length; i++) {
    const d = haversineMeters(from, candidates[i].place.location);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { stop: candidates[bestIdx], index: bestIdx };
}

/**
 * Order visits by proximity while honoring position locks
 * (`last`, or a 1-based slot like 9ª tappa).
 */
export function orderGiroStops(
  origin: PlaceRef,
  stops: GiroStop[],
): { ordered: GiroStop[]; warnings: string[] } {
  const n = stops.length;
  if (n === 0) return { ordered: [], warnings: [] };

  const warnings: string[] = [];
  const slots: Array<GiroStop | null> = Array.from({ length: n }, () => null);
  const free: GiroStop[] = [];

  const lastCandidates = stops.filter((s) => s.positionLock === "last");
  let lastStop: GiroStop | null = null;
  if (lastCandidates.length > 0) {
    lastStop = lastCandidates[0];
    if (lastCandidates.length > 1) {
      warnings.push(
        "Più tappe impostate come «ultima»: tengo solo la prima, le altre sono libere.",
      );
      free.push(...lastCandidates.slice(1));
    }
  }

  const claimed = new Set<string>();
  if (lastStop) claimed.add(lastStop.id);

  for (const s of stops) {
    if (claimed.has(s.id)) continue;
    if (typeof s.positionLock === "number" && Number.isFinite(s.positionLock)) {
      const idx = Math.min(n, Math.max(1, Math.round(s.positionLock))) - 1;
      if (slots[idx] == null) {
        slots[idx] = s;
        claimed.add(s.id);
      } else {
        warnings.push(
          `Posizione ${idx + 1} già occupata: «${s.place.label}» resta libera.`,
        );
        free.push(s);
        claimed.add(s.id);
      }
    }
  }

  for (const s of stops) {
    if (!claimed.has(s.id)) free.push(s);
  }

  if (lastStop) {
    const endSlot = slots[n - 1];
    if (endSlot == null) {
      slots[n - 1] = lastStop;
    } else if (endSlot.id !== lastStop.id) {
      warnings.push(
        `L’ultima posizione era già bloccata: «${lastStop.place.label}» resta libera.`,
      );
      free.push(lastStop);
    }
  }

  let current = origin.location;
  for (let i = 0; i < n; i++) {
    if (slots[i] != null) {
      current = slots[i]!.place.location;
      continue;
    }
    if (free.length === 0) break;
    const { stop, index } = pickNearest(current, free);
    free.splice(index, 1);
    slots[i] = stop;
    current = stop.place.location;
  }

  // Safety: any leftover free append / fill nulls
  for (let i = 0; i < n; i++) {
    if (slots[i] == null && free.length > 0) {
      slots[i] = free.shift()!;
    }
  }

  const ordered = slots.filter((s): s is GiroStop => s != null);
  return { ordered, warnings };
}

export function giroHasHardLocks(stops: GiroStop[]): boolean {
  return stops.some(
    (s) => s.positionLock === "last" || typeof s.positionLock === "number",
  );
}

/** Reorder intermediates using Google’s optimizedIntermediateWaypointIndex. */
export function applyOptimizedIntermediateOrder(
  intermediates: PlaceRef[],
  order: number[] | undefined,
): PlaceRef[] {
  if (!order || order.length !== intermediates.length) return intermediates;
  const next = order
    .map((i) => intermediates[i])
    .filter((p): p is PlaceRef => Boolean(p));
  return next.length === intermediates.length ? next : intermediates;
}

/** Rough urban drive time when the router did not return a leg (~32 km/h). */
export function estimateLegSeconds(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { seconds: number; meters: number } {
  const meters = Math.max(0, Math.round(haversineMeters(from, to)));
  const seconds = Math.max(60, Math.round(meters / (32_000 / 3600)));
  return { seconds, meters };
}

/**
 * Build clock arrivals from departure + route legs.
 * `orderedStops` = visits in route order (intermediates then destination).
 * Missing legs fall back to a distance-based estimate so “tempo tra tappe”
 * is always available in Giro / PDF.
 */
export function buildArrivalSchedule(params: {
  departureAt: string;
  origin: PlaceRef;
  orderedPlaces: PlaceRef[];
  legs: RouteLeg[];
  /** Optional giro metadata aligned with orderedPlaces */
  orderedGiroStops?: GiroStop[];
}): ScheduleStop[] {
  const startMs = new Date(params.departureAt).getTime();
  const safeStart = Number.isFinite(startMs) ? startMs : Date.now();

  const rows: ScheduleStop[] = [
    {
      kind: "origin",
      place: params.origin,
      arrivalAt: new Date(safeStart).toISOString(),
      legFromPreviousSeconds: 0,
      legFromPreviousMeters: 0,
      cumulativeSeconds: 0,
    },
  ];

  let cumulative = 0;
  let prevLoc = params.origin.location;
  for (let i = 0; i < params.orderedPlaces.length; i++) {
    const place = params.orderedPlaces[i];
    const giro = params.orderedGiroStops?.[i];
    const routerLeg = params.legs[i];
    const estimated = estimateLegSeconds(prevLoc, place.location);
    const hasRouterDuration =
      routerLeg != null &&
      Number.isFinite(routerLeg.durationSeconds) &&
      routerLeg.durationSeconds > 0;
    const legSeconds = hasRouterDuration
      ? Math.max(0, routerLeg.durationSeconds)
      : estimated.seconds;
    const legMeters =
      routerLeg != null &&
      Number.isFinite(routerLeg.distanceMeters) &&
      routerLeg.distanceMeters > 0
        ? Math.max(0, Math.round(routerLeg.distanceMeters))
        : estimated.meters;
    cumulative += legSeconds;
    const arrivalAt = new Date(safeStart + cumulative * 1000).toISOString();
    const arriveBy = giro?.arriveBy ?? null;
    let vsArriveBySeconds: number | null = null;
    if (arriveBy) {
      const target = new Date(arriveBy).getTime();
      if (Number.isFinite(target)) {
        vsArriveBySeconds = Math.round(
          (new Date(arrivalAt).getTime() - target) / 1000,
        );
      }
    }
    rows.push({
      kind: i === params.orderedPlaces.length - 1 ? "destination" : "stop",
      place,
      giroStopId: giro?.id,
      arrivalAt,
      legFromPreviousSeconds: legSeconds,
      legFromPreviousMeters: legMeters,
      cumulativeSeconds: cumulative,
      arriveBy,
      vsArriveBySeconds,
      legEstimated: !hasRouterDuration,
    });
    prevLoc = place.location;
  }

  return rows;
}

/** Compact “12 min · 4,2 km” for UI / PDF between two stops. */
export function formatLegTravelLabel(row: ScheduleStop): string | null {
  if (row.legFromPreviousSeconds <= 0 && row.legFromPreviousMeters <= 0) {
    return null;
  }
  const parts: string[] = [];
  if (row.legFromPreviousSeconds > 0) {
    parts.push(formatDuration(row.legFromPreviousSeconds));
  }
  if (row.legFromPreviousMeters > 0) {
    parts.push(formatDistance(row.legFromPreviousMeters));
  }
  if (parts.length === 0) return null;
  const base = parts.join(" · ");
  return row.legEstimated ? `${base} (stima)` : base;
}
