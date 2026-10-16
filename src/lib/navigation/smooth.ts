import type { LatLng } from "@/lib/types/trip";
import { normalizeHeading } from "@/lib/navigation/destination-point";

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: lerp(a.lat, b.lat, t),
    lng: lerp(a.lng, b.lng, t),
  };
}

/** Shortest-path heading interpolation. */
export function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return normalizeHeading(from + delta * t);
}

/** Google Maps–style navigation chevron (points up / north by default). */
export const NAV_CHEVRON_PATH =
  "M 0,-28 L 14,18 L 0,10 L -14,18 Z";
