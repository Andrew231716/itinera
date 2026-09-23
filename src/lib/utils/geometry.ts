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

/** Ray-casting point-in-polygon. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pathIntersectsPolygon(
  path: LatLng[],
  polygon: LatLng[],
): boolean {
  if (path.length === 0 || polygon.length < 3) return false;
  return path.some((p) => pointInPolygon(p, polygon));
}

export function pathNearPoint(
  path: LatLng[],
  center: LatLng,
  radiusMeters: number,
): boolean {
  return path.some((p) => haversineMeters(p, center) <= radiusMeters);
}

export function pathNearSegment(
  path: LatLng[],
  segment: LatLng[],
  bufferMeters: number,
): boolean {
  if (segment.length === 0) return false;
  for (const p of path) {
    for (const s of segment) {
      if (haversineMeters(p, s) <= bufferMeters) return true;
    }
  }
  return false;
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
