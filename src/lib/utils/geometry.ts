import type { LatLng } from "@/lib/types/trip";

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Decode Google encoded polyline algorithm. */
export function decodePolyline(encoded: string): LatLng[] {
  const coordinates: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}

/** Densify polyline so thin exclusion zones are less likely to be missed. */
export function densifyPath(path: LatLng[], maxStepMeters = 80): LatLng[] {
  if (path.length < 2) return [...path];
  const out: LatLng[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dist = haversineMeters(a, b);
    const steps = Math.max(1, Math.ceil(dist / maxStepMeters));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      });
    }
  }
  return out;
}

/**
 * Ray-casting point-in-polygon.
 * Points exactly on an edge are treated as inside (conservative for hard exclusions).
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  if (pointOnPolygonEdge(point, polygon)) return true;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng <
        ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointOnPolygonEdge(point: LatLng, polygon: LatLng[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (distancePointToSegmentMeters(point, a, b) <= 1) return true;
  }
  return false;
}

export function distancePointToSegmentMeters(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): number {
  const ab = haversineMeters(a, b);
  if (ab < 1e-6) return haversineMeters(p, a);
  // Local equirectangular projection around segment midpoint
  const lat0 = toRad((a.lat + b.lat) / 2);
  const ax = toRad(a.lng) * Math.cos(lat0) * EARTH_RADIUS_M;
  const ay = toRad(a.lat) * EARTH_RADIUS_M;
  const bx = toRad(b.lng) * Math.cos(lat0) * EARTH_RADIUS_M;
  const by = toRad(b.lat) * EARTH_RADIUS_M;
  const px = toRad(p.lng) * Math.cos(lat0) * EARTH_RADIUS_M;
  const py = toRad(p.lat) * EARTH_RADIUS_M;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function pathIntersectsPolygon(
  path: LatLng[],
  polygon: LatLng[],
): boolean {
  if (path.length === 0 || polygon.length < 3) return false;
  const dense = densifyPath(path);
  return dense.some((p) => pointInPolygon(p, polygon));
}

/**
 * Like pathIntersectsPolygon, but ignores points within `endpointBufferMeters`
 * of the path start/end. Used for country exclusions when origin/destination
 * already sit inside the avoided country — only transit deeper into the
 * polygon counts as a violation.
 */
export function pathIntersectsPolygonAwayFromEndpoints(
  path: LatLng[],
  polygon: LatLng[],
  endpointBufferMeters: number,
): boolean {
  if (path.length === 0 || polygon.length < 3) return false;
  const start = path[0];
  const end = path[path.length - 1];
  const dense = densifyPath(path);
  return dense.some((p) => {
    if (haversineMeters(p, start) <= endpointBufferMeters) return false;
    if (haversineMeters(p, end) <= endpointBufferMeters) return false;
    return pointInPolygon(p, polygon);
  });
}

export function pathNearPoint(
  path: LatLng[],
  center: LatLng,
  radiusMeters: number,
): boolean {
  const dense = densifyPath(path);
  return dense.some((p) => haversineMeters(p, center) <= radiusMeters);
}

export function pathNearSegment(
  path: LatLng[],
  segment: LatLng[],
  bufferMeters: number,
): boolean {
  if (segment.length === 0) return false;
  const densePath = densifyPath(path);
  const denseSeg = densifyPath(segment);
  for (const p of densePath) {
    for (let i = 1; i < denseSeg.length; i++) {
      if (distancePointToSegmentMeters(p, denseSeg[i - 1], denseSeg[i]) <= bufferMeters) {
        return true;
      }
    }
    for (const s of denseSeg) {
      if (haversineMeters(p, s) <= bufferMeters) return true;
    }
  }
  return false;
}

export function isValidPolygon(polygon: LatLng[]): {
  valid: boolean;
  reason?: string;
} {
  if (polygon.length < 3) {
    return { valid: false, reason: "Servono almeno 3 punti distinti." };
  }
  const unique = new Set(polygon.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`));
  if (unique.size < 3) {
    return { valid: false, reason: "I punti del poligono non sono abbastanza distinti." };
  }
  // Reject degenerate near-zero area (shoelace in degrees — rough)
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].lng * polygon[j].lat - polygon[j].lng * polygon[i].lat;
  }
  if (Math.abs(area) < 1e-10) {
    return { valid: false, reason: "Il poligono ha area quasi nulla." };
  }
  return { valid: true };
}

export function boundsFromPoints(points: LatLng[]): {
  north: number;
  south: number;
  east: number;
  west: number;
} | null {
  if (points.length === 0) return null;
  let north = points[0].lat;
  let south = points[0].lat;
  let east = points[0].lng;
  let west = points[0].lng;
  for (const p of points) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  return { north, south, east, west };
}
