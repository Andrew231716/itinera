import type { NavigationRuntime } from "@/lib/navigation/types";
import { normalizeHeading } from "@/lib/navigation/destination-point";

/**
 * Pick the best heading for camera / arrow:
 * - GPS course when moving
 * - compass when slow / stationary
 * - route bearing as last resort
 */
export function effectiveNavHeading(nav: NavigationRuntime): number {
  const moving =
    nav.speedMps != null && nav.speedMps > 1.4 && nav.headingDeg != null;
  if (moving) return normalizeHeading(nav.headingDeg!);
  if (nav.compassHeadingDeg != null) {
    return normalizeHeading(nav.compassHeadingDeg);
  }
  if (nav.headingDeg != null) return normalizeHeading(nav.headingDeg);
  if (nav.progress?.routeBearingDeg != null) {
    return normalizeHeading(nav.progress.routeBearingDeg);
  }
  return 0;
}
