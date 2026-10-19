import type { ComputedRoute } from "@/lib/types/route";
import type { LatLng } from "@/lib/types/trip";
import type { NavManeuver, NavProgress } from "@/lib/navigation/types";
import {
  pathCumulativeMeters,
  snapToPath,
} from "@/lib/navigation/geometry-nav";
import { findCurrentManeuverIndex } from "@/lib/navigation/maneuvers";
import { haversineMeters } from "@/lib/utils/geometry";
import {
  ARRIVAL_THRESHOLD_M,
  OFF_ROUTE_THRESHOLD_M,
} from "@/lib/navigation/nav-thresholds";
import {
  computeWaypointProgress,
  type NavWaypoint,
} from "@/lib/navigation/waypoints";

export {
  ARRIVAL_THRESHOLD_M,
  OFF_ROUTE_CLEAR_M,
  OFF_ROUTE_THRESHOLD_M,
} from "@/lib/navigation/nav-thresholds";

export function computeNavProgress(params: {
  position: LatLng;
  route: ComputedRoute;
  maneuvers: NavManeuver[];
  /** Stops + destination for multi-stop in-app navigation */
  waypoints?: NavWaypoint[];
  /** Index of the next committed waypoint (skip already visited) */
  committedWaypointIndex?: number;
}): NavProgress | null {
  const {
    position,
    route,
    maneuvers,
    waypoints = [],
    committedWaypointIndex = 0,
  } = params;
  const path = route.decodedPath;
  if (path.length < 2) return null;

  const snap = snapToPath(position, path);
  if (!snap) return null;

  const cum = pathCumulativeMeters(path);
  const total = cum[cum.length - 1] || route.distanceMeters || 1;
  const remainingMeters = Math.max(0, total - snap.traveledMeters);
  const ratio = total > 0 ? remainingMeters / total : 0;
  const remainingSeconds = Math.round((route.durationSeconds || 0) * ratio);

  const currentManeuverIndex = findCurrentManeuverIndex(
    maneuvers,
    snap.traveledMeters,
  );
  const nextManeuver = maneuvers[currentManeuverIndex] ?? null;
  const metersToNextManeuver = nextManeuver
    ? Math.max(0, nextManeuver.startOffsetMeters - snap.traveledMeters)
    : remainingMeters;

  const wp = computeWaypointProgress({
    position,
    traveledMeters: snap.traveledMeters,
    route,
    waypoints,
    committedIndex: committedWaypointIndex,
  });

  const dest = path[path.length - 1];
  const nearPath = snap.crossTrackMeters <= OFF_ROUTE_THRESHOLD_M;
  const arrivedFinal =
    wp.totalWaypoints > 0
      ? wp.atFinalDestination && nearPath
      : nearPath &&
        (remainingMeters <= ARRIVAL_THRESHOLD_M ||
          haversineMeters(position, dest) <= ARRIVAL_THRESHOLD_M);

  const offRoute = !arrivedFinal && !wp.atIntermediateStop && !nearPath;

  return {
    snapped: snap.snapped,
    segmentIndex: snap.segmentIndex,
    traveledMeters: snap.traveledMeters,
    remainingMeters,
    remainingSeconds,
    crossTrackMeters: snap.crossTrackMeters,
    routeBearingDeg: snap.routeBearingDeg,
    currentManeuverIndex,
    nextManeuver,
    metersToNextManeuver,
    offRoute,
    arrived: arrivedFinal,
    nextWaypointIndex: wp.nextWaypointIndex,
    nextWaypointLabel: wp.nextWaypoint?.label ?? null,
    nextWaypointKind: wp.nextWaypoint?.kind ?? null,
    metersToNextWaypoint: wp.metersToNextWaypoint,
    atIntermediateStop: wp.atIntermediateStop,
    totalWaypoints: wp.totalWaypoints,
  };
}
