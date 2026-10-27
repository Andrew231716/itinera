import type { ComputedRoute } from "@/lib/types/route";
import type { LatLng, PlaceRef, TripStop } from "@/lib/types/trip";
import { snapToPath } from "@/lib/navigation/geometry-nav";
import { haversineMeters } from "@/lib/utils/geometry";
import { ARRIVAL_THRESHOLD_M } from "@/lib/navigation/nav-thresholds";

export interface NavWaypoint {
  id: string;
  label: string;
  location: LatLng;
  kind: "stop" | "destination";
}

/**
 * Ordered targets for in-app navigation: intermediate stops then final destination.
 */
export function buildNavWaypoints(params: {
  stops: TripStop[];
  destination: PlaceRef | null;
}): NavWaypoint[] {
  const list: NavWaypoint[] = params.stops.map((s) => ({
    id: s.id,
    label: s.place.label,
    location: s.place.location,
    kind: "stop",
  }));
  if (params.destination) {
    list.push({
      id: params.destination.id || "destination",
      label: params.destination.label,
      location: params.destination.location,
      kind: "destination",
    });
  }
  return list;
}

/** Remaining stops after `nextWaypointIndex` (exclusive of destination). */
export function remainingStopPlaces(
  stops: TripStop[],
  nextWaypointIndex: number,
): PlaceRef[] {
  // Waypoints = [...stops, destination]; indices 0..stops.length-1 are stops.
  const start = Math.max(0, nextWaypointIndex);
  return stops.slice(start).map((s) => s.place);
}

/**
 * Path offset (meters from route start) for each waypoint, using legs when
 * available, otherwise snap of the place onto the polyline.
 */
export function waypointPathOffsets(
  route: ComputedRoute,
  waypoints: NavWaypoint[],
): number[] {
  if (waypoints.length === 0) return [];

  if (route.legs.length >= waypoints.length) {
    const offsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < waypoints.length; i++) {
      acc += Math.max(0, route.legs[i]?.distanceMeters ?? 0);
      offsets.push(acc);
    }
    return offsets;
  }

  const path = route.decodedPath;
  let last = 0;
  return waypoints.map((w) => {
    const snap = path.length >= 2 ? snapToPath(w.location, path) : null;
    const raw = snap?.traveledMeters ?? last;
    // Keep monotonic so we never "go back" to an earlier waypoint
    const offset = Math.max(last + 1, raw);
    last = offset;
    return offset;
  });
}

export interface WaypointProgress {
  nextWaypointIndex: number;
  nextWaypoint: NavWaypoint | null;
  metersToNextWaypoint: number;
  /** True when within arrival radius of an intermediate stop (not final). */
  atIntermediateStop: boolean;
  /** True when within arrival radius of the final destination. */
  atFinalDestination: boolean;
  totalWaypoints: number;
}

/**
 * Which waypoint we're heading to, and whether we just reached one.
 * `committedIndex` is the store's next target (skip already visited stops).
 */
export function computeWaypointProgress(params: {
  position: LatLng;
  traveledMeters: number;
  route: ComputedRoute;
  waypoints: NavWaypoint[];
  committedIndex: number;
}): WaypointProgress {
  const { position, traveledMeters, route, waypoints, committedIndex } =
    params;
  const totalWaypoints = waypoints.length;
  if (totalWaypoints === 0) {
    return {
      nextWaypointIndex: 0,
      nextWaypoint: null,
      metersToNextWaypoint: 0,
      atIntermediateStop: false,
      atFinalDestination: false,
      totalWaypoints: 0,
    };
  }

  const start = Math.min(
    Math.max(0, committedIndex),
    totalWaypoints - 1,
  );
  const offsets = waypointPathOffsets(route, waypoints);
  const arriveR = ARRIVAL_THRESHOLD_M;

  let nextWaypointIndex = start;
  let atIntermediateStop = false;

  // Walk intermediates: arrive → stay on that index; only advance after clearly past.
  for (let i = start; i < totalWaypoints - 1; i++) {
    const end = offsets[i] ?? 0;
    const along = end - traveledMeters;
    const nearPlace =
      haversineMeters(position, waypoints[i].location) <= arriveR * 1.4;
    const arriving = nearPlace || (along <= arriveR && along >= -arriveR);
    const clearlyPast = along < -arriveR && !nearPlace;

    if (arriving) {
      nextWaypointIndex = i;
      atIntermediateStop = true;
      break;
    }
    if (clearlyPast || traveledMeters >= end + arriveR * 0.5) {
      nextWaypointIndex = i + 1;
      continue;
    }
    // Still heading to this intermediate
    nextWaypointIndex = i;
    break;
  }

  const nextWaypoint = waypoints[nextWaypointIndex] ?? null;
  const endOffset = offsets[nextWaypointIndex] ?? traveledMeters;
  const metersToNextWaypoint = Math.max(0, endOffset - traveledMeters);
  const nearNext =
    nextWaypoint != null &&
    haversineMeters(position, nextWaypoint.location) <= arriveR;
  const isFinal = nextWaypointIndex >= totalWaypoints - 1;
  const atFinalDestination = Boolean(
    isFinal &&
      nextWaypoint &&
      (nearNext || metersToNextWaypoint <= arriveR),
  );

  return {
    nextWaypointIndex,
    nextWaypoint,
    metersToNextWaypoint,
    atIntermediateStop: Boolean(atIntermediateStop && !isFinal),
    atFinalDestination,
    totalWaypoints,
  };
}
