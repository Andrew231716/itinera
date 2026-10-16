import type { ComputedRoute } from "@/lib/types/route";
import type { NavProgress } from "@/lib/navigation/types";
import {
  getTrafficInfo,
  type TrafficInfo,
  type TrafficLevel,
} from "@/lib/routing/traffic-info";

export interface NavTripMetrics {
  remainingMeters: number;
  remainingSeconds: number;
  /** Wall-clock arrival estimate */
  eta: Date;
  etaLabel: string;
  /** Remaining minutes (rounded) for HUD */
  remainingMinutes: number;
  remainingMinutesLabel: string;
  traffic: TrafficInfo;
  /** Delay attributed to the remaining portion of the trip */
  remainingDelaySeconds: number;
  remainingDelayMinutes: number;
  delayLabel: string | null;
  level: TrafficLevel;
}

export function formatClockIt(date: Date): string {
  return date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Live trip metrics for the driving HUD (ETA, minutes left, traffic delay).
 * Uses route live duration (already traffic-aware) + proportional remaining delay.
 */
export function getNavTripMetrics(
  route: ComputedRoute,
  progress: NavProgress,
  nowMs: number = Date.now(),
): NavTripMetrics {
  const traffic = getTrafficInfo(route);
  const remainingMeters = progress.remainingMeters;
  const remainingSeconds = Math.max(0, progress.remainingSeconds);
  const eta = new Date(nowMs + remainingSeconds * 1000);
  const remainingMinutes = Math.max(0, Math.round(remainingSeconds / 60));

  const totalDist = route.distanceMeters || 1;
  const remainingRatio = Math.min(
    1,
    Math.max(0, remainingMeters / totalDist),
  );
  const remainingDelaySeconds = Math.round(
    traffic.delaySeconds * remainingRatio,
  );
  const remainingDelayMinutes = Math.round(remainingDelaySeconds / 60);

  let delayLabel: string | null = null;
  if (traffic.level !== "unknown" && remainingDelaySeconds >= 60) {
    delayLabel = `+${remainingDelayMinutes} min`;
  } else if (traffic.level !== "unknown" && traffic.delaySeconds >= 60) {
    // Still show route-level delay chip when remaining portion is tiny
    delayLabel = `+${Math.round(traffic.delaySeconds / 60)} min`;
  }

  return {
    remainingMeters,
    remainingSeconds,
    eta,
    etaLabel: formatClockIt(eta),
    remainingMinutes,
    remainingMinutesLabel:
      remainingMinutes < 1
        ? "<1 min"
        : remainingMinutes < 60
          ? `${remainingMinutes} min`
          : `${Math.floor(remainingMinutes / 60)} h ${remainingMinutes % 60} min`,
    traffic,
    remainingDelaySeconds,
    remainingDelayMinutes,
    delayLabel,
    level: traffic.level,
  };
}
