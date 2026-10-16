import type { LatLng } from "@/lib/types/trip";
import {
  distancePointToSegmentMeters,
  haversineMeters,
} from "@/lib/utils/geometry";

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Initial bearing from A → B in degrees [0, 360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Closest point on segment AB to P (approx local projection). */
export function closestPointOnSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): { point: LatLng; t: number; distanceMeters: number } {
  const lat0 = toRad((a.lat + b.lat) / 2);
  const ax = toRad(a.lng) * Math.cos(lat0) * EARTH_RADIUS_M;
  const ay = toRad(a.lat) * EARTH_RADIUS_M;
  const bx = toRad(b.lng) * Math.cos(lat0) * EARTH_RADIUS_M;
  const by = toRad(b.lat) * EARTH_RADIUS_M;
  const px = toRad(p.lng) * Math.cos(lat0) * EARTH_RADIUS_M;
  const py = toRad(p.lat) * EARTH_RADIUS_M;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 < 1e-6
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  const point: LatLng = {
    lat: toDeg(qy / EARTH_RADIUS_M),
    lng: toDeg(qx / (EARTH_RADIUS_M * Math.cos(lat0))),
  };
  return {
    point,
    t,
    distanceMeters: distancePointToSegmentMeters(p, a, b),
  };
}

export interface PathSnap {
  snapped: LatLng;
  segmentIndex: number;
  /** Distance along path from start to snapped point */
  traveledMeters: number;
  crossTrackMeters: number;
  routeBearingDeg: number;
}

/** Cumulative distances along a path (length = path.length). */
export function pathCumulativeMeters(path: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(path[i - 1], path[i]));
  }
  return cum;
}

/** Snap a GPS position to the nearest point on the route polyline. */
export function snapToPath(position: LatLng, path: LatLng[]): PathSnap | null {
  if (path.length < 2) return null;
  const cum = pathCumulativeMeters(path);
  let best: PathSnap | null = null;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const { point, t, distanceMeters } = closestPointOnSegment(position, a, b);
    const traveled = cum[i] + haversineMeters(a, b) * t;
    if (!best || distanceMeters < best.crossTrackMeters) {
      best = {
        snapped: point,
        segmentIndex: i,
        traveledMeters: traveled,
        crossTrackMeters: distanceMeters,
        routeBearingDeg: bearingDegrees(a, b),
      };
    }
  }
  return best;
}

export function remainingPathFrom(
  path: LatLng[],
  snap: PathSnap,
): LatLng[] {
  if (path.length === 0) return [];
  const tail = path.slice(snap.segmentIndex + 1);
  return [snap.snapped, ...tail];
}
