import type { LatLng } from "@/lib/types/trip";

const EARTH_RADIUS_M = 6371000;

/** Point at `distanceMeters` along `bearingDeg` from `from`. */
export function destinationPoint(
  from: LatLng,
  bearingDeg: number,
  distanceMeters: number,
): LatLng {
  const δ = distanceMeters / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (from.lat * Math.PI) / 180;
  const λ1 = (from.lng * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * sinδ * cosφ1,
      cosδ - sinφ1 * Math.sin(φ2),
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
