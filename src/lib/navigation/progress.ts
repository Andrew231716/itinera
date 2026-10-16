import type { ComputedRoute } from "@/lib/types/route";
import type { LatLng } from "@/lib/types/trip";
import type { NavManeuver, NavProgress } from "@/lib/navigation/types";
import {
  pathCumulativeMeters,
  snapToPath,
} from "@/lib/navigation/geometry-nav";
import { findCurrentManeuverIndex } from "@/lib/navigation/maneuvers";
import { haversineMeters } from "@/lib/utils/geometry";

/** Meters away from the Itinera path before we flag off-route. */
export const OFF_ROUTE_THRESHOLD_M = 90;
/** Hysteresis: once off-route, need to get this close to clear the flag. */
export const OFF_ROUTE_CLEAR_M = 45;
/** Arrive when within this distance of the destination. */
export const ARRIVAL_THRESHOLD_M = 35;

export function computeNavProgress(params: {
  position: LatLng;
  route: ComputedRoute;
  maneuvers: NavManeuver[];
}): NavProgress | null {
  const { position, route, maneuvers } = params;
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

  const dest = path[path.length - 1];
  const nearPath = snap.crossTrackMeters <= OFF_ROUTE_THRESHOLD_M;
  const arrived =
    nearPath &&
    (remainingMeters <= ARRIVAL_THRESHOLD_M ||
      haversineMeters(position, dest) <= ARRIVAL_THRESHOLD_M);

  const offRoute = !arrived && !nearPath;

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
    arrived,
  };
}
