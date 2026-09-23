import type { ConstraintViolation } from "@/lib/types/route";
import type { CustomExclusion, LatLng } from "@/lib/types/trip";
import {
  pathIntersectsPolygon,
  pathNearPoint,
  pathNearSegment,
} from "@/lib/utils/geometry";

/**
 * Verifies whether a decoded route path violates custom exclusions.
 * Hard constraints produce violations; soft ones are advisory.
 */
export function checkRouteConstraints(
  path: LatLng[],
  exclusions: CustomExclusion[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const exclusion of exclusions) {
    let intersects = false;

    switch (exclusion.kind) {
      case "city":
      case "address":
      case "road": {
        if (!exclusion.place) break;
        intersects = pathNearPoint(
          path,
          exclusion.place.location,
          exclusion.radiusMeters,
        );
        break;
      }
      case "road_segment": {
        intersects = pathNearSegment(
          path,
          exclusion.path,
          exclusion.bufferMeters,
        );
        break;
      }
      case "geo_zone": {
        intersects = pathIntersectsPolygon(path, exclusion.polygon);
        break;
      }
    }

    if (!intersects) continue;

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

  return violations;
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
