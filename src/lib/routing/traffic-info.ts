import type { ComputedRoute } from "@/lib/types/route";

export type TrafficLevel =
  | "unknown"
  | "fluid"
  | "moderate"
  | "heavy"
  | "severe";

export interface TrafficInfo {
  liveDurationSeconds: number;
  staticDurationSeconds?: number;
  delaySeconds: number;
  delayRatio: number;
  level: TrafficLevel;
  label: string;
  summary: string;
}

/**
 * Infer traffic load from Google Routes live duration vs static (no-traffic) duration.
 * Never invents values: if static duration is missing, level stays «unknown».
 */
export function getTrafficInfo(route: ComputedRoute): TrafficInfo {
  const live = route.durationSeconds;
  const staticDur = route.staticDurationSeconds;
  if (staticDur == null || staticDur <= 0 || live <= 0) {
    return {
      liveDurationSeconds: live,
      staticDurationSeconds: staticDur,
      delaySeconds: 0,
      delayRatio: 0,
      level: "unknown",
      label: "Traffico n/d",
      summary:
        "Il motore non ha restituito la durata senza traffico: non posso stimare il ritardo.",
    };
  }

  const delaySeconds = Math.max(0, Math.round(live - staticDur));
  const delayRatio = delaySeconds / staticDur;

  let level: TrafficLevel;
  let label: string;
  if (delaySeconds < 120 || delayRatio < 0.05) {
    level = "fluid";
    label = "Traffico fluido";
  } else if (delayRatio < 0.15) {
    level = "moderate";
    label = "Traffico moderato";
  } else if (delayRatio < 0.3) {
    level = "heavy";
    label = "Traffico intenso";
  } else {
    level = "severe";
    label = "Traffico molto intenso";
  }

  const delayMin = Math.round(delaySeconds / 60);
  const summary =
    delaySeconds < 60
      ? `${label}: ritardo stimato sotto il minuto rispetto alle condizioni senza traffico.`
      : `${label}: circa +${delayMin} min rispetto alle condizioni senza traffico (${Math.round(delayRatio * 100)}%).`;

  return {
    liveDurationSeconds: live,
    staticDurationSeconds: staticDur,
    delaySeconds,
    delayRatio,
    level,
    label,
    summary,
  };
}

export const TRAFFIC_MONITOR_INTERVAL_MS = 3 * 60 * 1000;
