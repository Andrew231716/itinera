import type {
  CustomExclusion,
  GeoZoneExclusion,
  LatLng,
  PlaceRef,
  PointExclusion,
} from "@/lib/types/trip";
import { matchCountryZone } from "@/lib/geo/country-zones";

/**
 * Choose an avoidance radius that is usable for routing checks.
 * Tiny radii (e.g. 800 m on a dogana) make every corridor route look “violating”
 * without giving Google alternatives room — or miss the corridor entirely.
 */
export function suggestedExclusionRadiusMeters(
  kind: PointExclusion["kind"],
  label: string,
): number {
  const l = label.toLowerCase();
  const isBorder =
    /dogana|valico|confine|border|customs| frontier|frontiera|gated/.test(l) ||
    /chiasso|brogeda|como sud|mendrisio/.test(l);
  const isCityLike =
    kind === "city" ||
    /\b(citt[aà]|centro|milano|roma|lugano|como|bologna|firenze)\b/.test(l);

  if (isBorder) return 3500;
  if (isCityLike) return 10000;
  if (kind === "road") return 250;
  return 2000; // address / generic point
}

export function createPointExclusion(params: {
  id: string;
  kind: PointExclusion["kind"];
  label: string;
  place: PlaceRef;
  strength?: PointExclusion["strength"];
  radiusMeters?: number;
}): PointExclusion {
  return {
    id: params.id,
    kind: params.kind,
    label: params.label,
    strength: params.strength ?? "hard",
    place: params.place,
    radiusMeters:
      params.radiusMeters ??
      suggestedExclusionRadiusMeters(params.kind, params.label),
    createdAt: new Date().toISOString(),
  };
}

export function createCountryExclusion(params: {
  id: string;
  label: string;
  strength?: GeoZoneExclusion["strength"];
}): GeoZoneExclusion | null {
  const zone = matchCountryZone(params.label);
  if (!zone) return null;
  return {
    id: params.id,
    kind: "geo_zone",
    label: zone.label,
    strength: params.strength ?? "hard",
    polygon: zone.polygon.map((p) => ({ ...p })),
    notes: `Esclusione paese: ${zone.label} (poligono approssimato).`,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build the best exclusion for a label: country polygon when recognized,
 * otherwise a point exclusion (requires place).
 */
export function createExclusionFromLabel(params: {
  id: string;
  kind: PointExclusion["kind"] | "geo_zone" | "road_segment";
  label: string;
  place?: PlaceRef | null;
  strength?: "hard" | "soft";
}): CustomExclusion | null {
  const country = createCountryExclusion({
    id: params.id,
    label: params.label,
    strength: params.strength,
  });
  if (country) return country;

  if (!params.place) return null;
  const kind =
    params.kind === "geo_zone" || params.kind === "road_segment"
      ? "city"
      : params.kind;
  return createPointExclusion({
    id: params.id,
    kind,
    label: params.label,
    place: params.place,
    strength: params.strength,
  });
}

/** Geographic offset used to request a detour intermediate around an exclusion. */
export function offsetLatLng(
  center: LatLng,
  bearingDeg: number,
  distanceMeters: number,
): LatLng {
  const R = 6371000;
  const δ = distanceMeters / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (center.lat * Math.PI) / 180;
  const λ1 = (center.lng * Math.PI) / 180;
  const sinφ2 =
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.min(1, Math.max(-1, sinφ2)));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function hardPointExclusions(
  exclusions: CustomExclusion[],
): PointExclusion[] {
  return exclusions.filter(
    (e): e is PointExclusion =>
      e.strength === "hard" &&
      (e.kind === "city" || e.kind === "address" || e.kind === "road") &&
      Boolean(e.place),
  );
}
