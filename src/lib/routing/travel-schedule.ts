import { haversineMeters } from "@/lib/utils/geometry";
import type { RouteLeg } from "@/lib/types/route";
import type { PlaceRef } from "@/lib/types/trip";

export type ScheduleStop = {
  kind: "origin" | "stop" | "destination";
  place: PlaceRef;
  /** ISO arrival (for origin = departure time) */
  arrivalAt: string;
  legFromPreviousSeconds: number;
  cumulativeSeconds: number;
};

/**
 * Greedy nearest-neighbor order from a fixed start through all places.
 * Simple “vicinanza l’una dall’altra” for a list of stops.
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

/**
 * Build clock arrivals from departure + route legs.
 * `orderedPlaces` = intermediates then destination (same order as legs).
 */
export function buildArrivalSchedule(params: {
  departureAt: string;
  origin: PlaceRef;
  orderedPlaces: PlaceRef[];
  legs: RouteLeg[];
}): ScheduleStop[] {
  const startMs = new Date(params.departureAt).getTime();
  const safeStart = Number.isFinite(startMs) ? startMs : Date.now();

  const rows: ScheduleStop[] = [
    {
      kind: "origin",
      place: params.origin,
      arrivalAt: new Date(safeStart).toISOString(),
      legFromPreviousSeconds: 0,
      cumulativeSeconds: 0,
    },
  ];

  let cumulative = 0;
  for (let i = 0; i < params.orderedPlaces.length; i++) {
    const place = params.orderedPlaces[i];
    const legSeconds = Math.max(0, params.legs[i]?.durationSeconds ?? 0);
    cumulative += legSeconds;
    rows.push({
      kind: i === params.orderedPlaces.length - 1 ? "destination" : "stop",
      place,
      arrivalAt: new Date(safeStart + cumulative * 1000).toISOString(),
      legFromPreviousSeconds: legSeconds,
      cumulativeSeconds: cumulative,
    });
  }

  return rows;
}
