import type { ConstraintViolation } from "@/lib/types/route";
import type { CustomExclusion, LatLng } from "@/lib/types/trip";
import {
  isValidPolygon,
  pathIntersectsPolygon,
  pathIntersectsPolygonAwayFromEndpoints,
  pathNearPoint,
  pathNearSegment,
} from "@/lib/utils/geometry";

export type ConstraintCheckability = "verified" | "unverifiable";

export interface ConstraintCheckResult {
  violations: ConstraintViolation[];
  unverifiable: Array<{
    exclusionId: string;
    exclusionLabel: string;
    reason: string;
  }>;
}

/** Country polygons: ignore path near OD so departure from inside CH is fair. */
const COUNTRY_ZONE_ENDPOINT_BUFFER_M = 8000;

function isCountryGeoZone(
  exclusion: CustomExclusion,
): exclusion is CustomExclusion & { kind: "geo_zone"; notes?: string } {
  return (
    exclusion.kind === "geo_zone" &&
    typeof exclusion.notes === "string" &&
    exclusion.notes.startsWith("Esclusione paese:")
  );
}

/**
 * Verifies whether a decoded route path violates custom exclusions.
 * Hard constraints produce violations; soft ones are advisory.
 * Empty path → unverifiable (cannot claim conformity).
 */
export function checkRouteConstraints(
  path: LatLng[],
  exclusions: CustomExclusion[],
): ConstraintViolation[] {
  return checkRouteConstraintsDetailed(path, exclusions).violations;
}

export function checkRouteConstraintsDetailed(
  path: LatLng[],
  exclusions: CustomExclusion[],
): ConstraintCheckResult {
  const violations: ConstraintViolation[] = [];
  const unverifiable: ConstraintCheckResult["unverifiable"] = [];

  if (path.length === 0 && exclusions.length > 0) {
    for (const exclusion of exclusions) {
      unverifiable.push({
        exclusionId: exclusion.id,
        exclusionLabel: exclusion.label,
        reason:
          "Geometria del percorso assente: impossibile verificare l’esclusione.",
      });
    }
    return { violations, unverifiable };
  }

  for (const exclusion of exclusions) {
    let intersects = false;
    let checkable = true;

    switch (exclusion.kind) {
      case "city":
      case "address":
      case "road": {
        if (!exclusion.place) {
          checkable = false;
          unverifiable.push({
            exclusionId: exclusion.id,
            exclusionLabel: exclusion.label,
            reason: "Esclusione senza coordinate utilizzabili.",
          });
          break;
        }
        intersects = pathNearPoint(
          path,
          exclusion.place.location,
          exclusion.radiusMeters,
        );
        break;
      }
      case "road_segment": {
        if (exclusion.path.length < 2) {
          checkable = false;
          unverifiable.push({
            exclusionId: exclusion.id,
            exclusionLabel: exclusion.label,
            reason: "Segmento stradale incompleto (servono almeno 2 punti).",
          });
          break;
        }
        intersects = pathNearSegment(
          path,
          exclusion.path,
          exclusion.bufferMeters,
        );
        break;
      }
      case "geo_zone": {
        const validity = isValidPolygon(exclusion.polygon);
        if (!validity.valid) {
          checkable = false;
          unverifiable.push({
            exclusionId: exclusion.id,
            exclusionLabel: exclusion.label,
            reason: validity.reason ?? "Poligono non valido.",
          });
          break;
        }
        intersects = isCountryGeoZone(exclusion)
          ? pathIntersectsPolygonAwayFromEndpoints(
              path,
              exclusion.polygon,
              COUNTRY_ZONE_ENDPOINT_BUFFER_M,
            )
          : pathIntersectsPolygon(path, exclusion.polygon);
        break;
      }
    }

    if (!checkable || !intersects) continue;

    violations.push({
      exclusionId: exclusion.id,
      exclusionLabel: exclusion.label,
      severity: exclusion.strength,
      message:
        exclusion.strength === "hard"
          ? `Il percorso attraversa l’area da evitare «${exclusion.label}».`
          : `Il percorso passa vicino a «${exclusion.label}» (preferenza soft).`,
    });
  }

  return { violations, unverifiable };
}

/**
 * Ranking helper: prefer routes without hard violations, then fewer soft ones,
 * then shorter duration.
 */
export function rankRoutesByConstraints<
  T extends {
    violations: ConstraintViolation[];
    durationSeconds: number;
  },
>(routes: T[]): T[] {
  return [...routes].sort((a, b) => {
    const hardA = a.violations.filter((v) => v.severity === "hard").length;
    const hardB = b.violations.filter((v) => v.severity === "hard").length;
    if (hardA !== hardB) return hardA - hardB;
    const softA = a.violations.filter((v) => v.severity === "soft").length;
    const softB = b.violations.filter((v) => v.severity === "soft").length;
    if (softA !== softB) return softA - softB;
    return a.durationSeconds - b.durationSeconds;
  });
}

/** A route is "conforme" only if no hard violations and no unverifiable hard exclusions. */
export function isRouteConformant(
  violations: ConstraintViolation[],
  unverifiable: ConstraintCheckResult["unverifiable"],
  exclusions: CustomExclusion[],
): boolean {
  if (violations.some((v) => v.severity === "hard")) return false;
  const hardIds = new Set(
    exclusions.filter((e) => e.strength === "hard").map((e) => e.id),
  );
  if (unverifiable.some((u) => hardIds.has(u.exclusionId))) return false;
  return true;
}
