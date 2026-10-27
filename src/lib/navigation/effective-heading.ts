import type { NavigationRuntime } from "@/lib/navigation/types";
import { normalizeHeading } from "@/lib/navigation/destination-point";

function shortestDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Pick the best heading for camera / arrow.
 * When snapped on-route, lock to the path bearing so the chevron
 * stays aligned with the green strip (GPS/compass alone often skews it).
 */
export function effectiveNavHeading(nav: NavigationRuntime): number {
  const routeBearing = nav.progress?.routeBearingDeg;
  const onRoute =
    nav.progress != null &&
    !nav.progress.offRoute &&
    nav.progress.crossTrackMeters < 40 &&
    routeBearing != null;

  if (onRoute && routeBearing != null) {
    const moving =
      nav.speedMps != null && nav.speedMps > 1.4 && nav.headingDeg != null;
    if (moving) {
      const gps = normalizeHeading(nav.headingDeg!);
      const delta = shortestDelta(routeBearing, gps);
      // Soft blend only when GPS roughly agrees with the road
      if (Math.abs(delta) <= 28) {
        return normalizeHeading(routeBearing + delta * 0.2);
      }
    }
    return normalizeHeading(routeBearing);
  }

  const moving =
    nav.speedMps != null && nav.speedMps > 1.4 && nav.headingDeg != null;
  if (moving) return normalizeHeading(nav.headingDeg!);
  if (nav.compassHeadingDeg != null) {
    return normalizeHeading(nav.compassHeadingDeg);
  }
  if (nav.headingDeg != null) return normalizeHeading(nav.headingDeg);
  if (routeBearing != null) return normalizeHeading(routeBearing);
  return 0;
}
