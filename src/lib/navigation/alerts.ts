import type { LatLng } from "@/lib/types/trip";
import { haversineMeters } from "@/lib/utils/geometry";
import { snapToPath, pathCumulativeMeters } from "@/lib/navigation/geometry-nav";

export type NavAlertKind =
  | "speed_camera"
  | "average_speed"
  | "traffic_light_camera"
  | "speed_check"
  | "roadworks"
  | "speed_limit";

export interface NavAlert {
  id: string;
  kind: NavAlertKind;
  label: string;
  location: LatLng;
  /** Enforced / posted limit when known */
  maxspeedKmh: number | null;
  /** Meters along the route polyline from origin (when snap succeeds) */
  routeOffsetMeters: number | null;
}

export interface NavAlertSnapshot {
  alerts: NavAlert[];
  /** Current road speed limit near the vehicle */
  speedLimitKmh: number | null;
  /** Next alert ahead on the route */
  nextAlert: NavAlert | null;
  metersToNextAlert: number | null;
  fetchedAt: string | null;
  source: "osm" | "none";
  attribution: string;
}

export const EMPTY_ALERT_SNAPSHOT: NavAlertSnapshot = {
  alerts: [],
  speedLimitKmh: null,
  nextAlert: null,
  metersToNextAlert: null,
  fetchedAt: null,
  source: "none",
  attribution: "© OpenStreetMap contributors",
};

export function alertKindLabel(kind: NavAlertKind): string {
  switch (kind) {
    case "speed_camera":
      return "Autovelox";
    case "average_speed":
      return "Tutor / controllo velocità media";
    case "traffic_light_camera":
      return "Controllo semaforico";
    case "speed_check":
      return "Controllo velocità";
    case "roadworks":
      return "Lavori in corso";
    case "speed_limit":
      return "Limite di velocità";
    default:
      return "Segnalazione";
  }
}

export function voiceCueForAlert(
  alert: NavAlert,
  metersAhead: number,
): string {
  const kind = alertKindLabel(alert.kind);
  const dist =
    metersAhead >= 1000
      ? `${(metersAhead / 1000).toFixed(1).replace(".", ",")} chilometri`
      : `${Math.round(metersAhead)} metri`;
  if (alert.maxspeedKmh != null && alert.kind !== "roadworks") {
    return `Attenzione, ${kind} tra ${dist}, limite ${alert.maxspeedKmh}`;
  }
  return `Attenzione, ${kind} tra ${dist}`;
}

/**
 * Parse OSM maxspeed values (Italy-centric defaults for bare tags).
 */
export function parseMaxspeedKmh(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!t || t === "none" || t === "signals") return null;

  const italian: Record<string, number> = {
    "it:urban": 50,
    "it:rural": 90,
    "it:trunk": 110,
    "it:motorway": 130,
    "it:living_street": 20,
    urban: 50,
    rural: 90,
    motorway: 130,
  };
  if (italian[t] != null) return italian[t];

  const mph = t.match(/^(\d+(?:\.\d)?)\s*mph$/);
  if (mph) return Math.round(Number(mph[1]) * 1.60934);

  const kmh = t.match(/^(\d+(?:\.\d)?)\s*(?:km\/h|kph)?$/);
  if (kmh) return Math.round(Number(kmh[1]));

  // Conditional first number: "50 @ (Mo-Fr …)"
  const cond = t.match(/^(\d+)/);
  if (cond) return Math.round(Number(cond[1]));
  return null;
}

/** Attach route offsets and keep alerts near the path. */
export function projectAlertsOntoRoute(
  alerts: NavAlert[],
  path: LatLng[],
  maxCrossTrackM = 120,
): NavAlert[] {
  if (path.length < 2) return alerts;
  const out: NavAlert[] = [];
  for (const a of alerts) {
    const snap = snapToPath(a.location, path);
    if (!snap || snap.crossTrackMeters > maxCrossTrackM) continue;
    out.push({ ...a, routeOffsetMeters: snap.traveledMeters });
  }
  out.sort(
    (x, y) => (x.routeOffsetMeters ?? 0) - (y.routeOffsetMeters ?? 0),
  );
  return out;
}

export function pickSpeedLimitNear(
  position: LatLng,
  limitSamples: Array<{ location: LatLng; maxspeedKmh: number }>,
  maxDistM = 45,
): number | null {
  let best: number | null = null;
  let bestD = maxDistM;
  for (const s of limitSamples) {
    const d = haversineMeters(position, s.location);
    if (d <= bestD) {
      bestD = d;
      best = s.maxspeedKmh;
    }
  }
  return best;
}

export function findNextAlertAhead(
  alerts: NavAlert[],
  traveledMeters: number,
  lookAheadM = 1200,
): { alert: NavAlert; metersAhead: number } | null {
  for (const a of alerts) {
    if (a.routeOffsetMeters == null) continue;
    if (a.kind === "speed_limit") continue;
    const ahead = a.routeOffsetMeters - traveledMeters;
    if (ahead > 15 && ahead <= lookAheadM) {
      return { alert: a, metersAhead: ahead };
    }
  }
  return null;
}

/** Sample points along a path for Overpass bbox / limit matching. */
export function samplePathPoints(path: LatLng[], everyMeters = 400): LatLng[] {
  if (path.length === 0) return [];
  if (path.length === 1) return [path[0]];
  const cum = pathCumulativeMeters(path);
  const total = cum[cum.length - 1] || 0;
  const samples: LatLng[] = [path[0]];
  let next = everyMeters;
  let i = 1;
  while (next < total && i < path.length) {
    while (i < cum.length && cum[i] < next) i++;
    if (i >= path.length) break;
    samples.push(path[i]);
    next += everyMeters;
  }
  samples.push(path[path.length - 1]);
  return samples;
}

export function bboxFromPoints(
  points: LatLng[],
  padDeg = 0.01,
): { south: number; west: number; north: number; east: number } | null {
  if (points.length === 0) return null;
  let south = points[0].lat;
  let north = points[0].lat;
  let west = points[0].lng;
  let east = points[0].lng;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  return {
    south: south - padDeg,
    west: west - padDeg,
    north: north + padDeg,
    east: east + padDeg,
  };
}
