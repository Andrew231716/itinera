import type { ScheduleStop } from "@/lib/routing/travel-schedule";
import { formatDuration } from "@/lib/utils/format";

export type GiroRunStopStatus =
  | "pending"
  | "en_route"
  | "at_stop"
  | "done"
  | "skipped";

export type GiroRunStopLog = {
  scheduleIndex: number;
  giroStopId?: string;
  label: string;
  plannedArrivalAt: string;
  plannedDepartAt: string | null;
  dwellMinutes: number;
  actualArrivalAt: string | null;
  actualDepartAt: string | null;
  /** Extra minutes the courier added while at the stop (traffic/wait). */
  extraDelayMinutes: number;
  status: GiroRunStopStatus;
  /** actualArrival − plannedArrival (positive = late), seconds */
  arrivalDeltaSeconds: number | null;
};

export type GiroRunStatus = "idle" | "running" | "paused" | "completed";

export type GiroRunState = {
  status: GiroRunStatus;
  startedAt: string | null;
  /** Index into schedule / logs */
  currentIndex: number;
  logs: GiroRunStopLog[];
  pauseStartedAt: string | null;
  totalPausedSeconds: number;
};

export function createGiroRun(schedule: ScheduleStop[]): GiroRunState {
  const logs: GiroRunStopLog[] = schedule.map((row, scheduleIndex) => ({
    scheduleIndex,
    giroStopId: row.giroStopId,
    label: row.place.label,
    plannedArrivalAt: row.arrivalAt,
    plannedDepartAt: row.departAt ?? null,
    dwellMinutes: row.dwellMinutes ?? 0,
    actualArrivalAt: null,
    actualDepartAt: null,
    extraDelayMinutes: 0,
    status: scheduleIndex === 0 ? "en_route" : "pending",
    arrivalDeltaSeconds: null,
  }));
  // Origin: already "there" at start — treat as at_stop ready to leave after optional dwell.
  if (logs[0]) {
    logs[0].status = "at_stop";
    logs[0].actualArrivalAt = logs[0].plannedArrivalAt;
    logs[0].arrivalDeltaSeconds = 0;
  }
  return {
    status: "idle",
    startedAt: null,
    currentIndex: 0,
    logs,
    pauseStartedAt: null,
    totalPausedSeconds: 0,
  };
}

export function startGiroRun(state: GiroRunState, at = new Date()): GiroRunState {
  if (state.status === "running") return state;
  const startedAt = at.toISOString();
  const logs = state.logs.map((l, i) =>
    i === 0
      ? {
          ...l,
          status: "at_stop" as const,
          actualArrivalAt: l.actualArrivalAt ?? startedAt,
          arrivalDeltaSeconds: l.arrivalDeltaSeconds ?? 0,
        }
      : { ...l, status: i === 1 ? ("en_route" as const) : l.status },
  );
  // If starting from origin with no dwell, current is origin; courier taps "Parti" or we auto-advance.
  return {
    ...state,
    status: "running",
    startedAt,
    currentIndex: 0,
    logs,
    pauseStartedAt: null,
  };
}

function deltaSeconds(actualIso: string, plannedIso: string): number {
  return Math.round(
    (new Date(actualIso).getTime() - new Date(plannedIso).getTime()) / 1000,
  );
}

/** Courier arrived at the current stop (or next en_route stop). */
export function markArrived(state: GiroRunState, at = new Date()): GiroRunState {
  if (state.status !== "running" && state.status !== "paused") return state;
  const logs = state.logs.map((l) => ({ ...l }));
  let idx = state.currentIndex;

  // If still at previous stop without departing, force depart first.
  if (logs[idx]?.status === "at_stop" && idx + 1 < logs.length) {
    const nowIso = at.toISOString();
    logs[idx] = {
      ...logs[idx],
      status: "done",
      actualDepartAt: logs[idx].actualDepartAt ?? nowIso,
    };
    idx += 1;
    logs[idx] = { ...logs[idx], status: "en_route" };
  }

  if (!logs[idx] || logs[idx].status === "done") return state;

  const nowIso = at.toISOString();
  logs[idx] = {
    ...logs[idx],
    status: "at_stop",
    actualArrivalAt: nowIso,
    arrivalDeltaSeconds: deltaSeconds(nowIso, logs[idx].plannedArrivalAt),
  };

  return { ...state, status: "running", currentIndex: idx, logs, pauseStartedAt: null };
}

/** Leave current stop after service / dwell (optionally with extra delay already set). */
export function markDeparted(state: GiroRunState, at = new Date()): GiroRunState {
  if (state.status !== "running" && state.status !== "paused") return state;
  const logs = state.logs.map((l) => ({ ...l }));
  const idx = state.currentIndex;
  const cur = logs[idx];
  if (!cur || cur.status !== "at_stop") return state;

  const nowIso = at.toISOString();
  logs[idx] = {
    ...cur,
    status: "done",
    actualDepartAt: nowIso,
  };

  if (idx + 1 >= logs.length) {
    return {
      ...state,
      status: "completed",
      currentIndex: idx,
      logs,
      pauseStartedAt: null,
    };
  }

  logs[idx + 1] = { ...logs[idx + 1], status: "en_route" };
  return {
    ...state,
    status: "running",
    currentIndex: idx + 1,
    logs,
    pauseStartedAt: null,
  };
}

export function addStopDelayMinutes(
  state: GiroRunState,
  minutes: number,
): GiroRunState {
  const logs = state.logs.map((l) => ({ ...l }));
  const cur = logs[state.currentIndex];
  if (!cur || cur.status !== "at_stop") return state;
  const extra = Math.max(0, Math.round(cur.extraDelayMinutes + minutes));
  logs[state.currentIndex] = { ...cur, extraDelayMinutes: extra };
  return { ...state, logs };
}

export function setStopDelayMinutes(
  state: GiroRunState,
  minutes: number,
): GiroRunState {
  const logs = state.logs.map((l) => ({ ...l }));
  const cur = logs[state.currentIndex];
  if (!cur || cur.status !== "at_stop") return state;
  logs[state.currentIndex] = {
    ...cur,
    extraDelayMinutes: Math.max(0, Math.round(minutes)),
  };
  return { ...state, logs };
}

export function skipCurrentStop(state: GiroRunState, at = new Date()): GiroRunState {
  if (state.status !== "running" && state.status !== "paused") return state;
  const logs = state.logs.map((l) => ({ ...l }));
  const idx = state.currentIndex;
  if (!logs[idx]) return state;
  logs[idx] = {
    ...logs[idx],
    status: "skipped",
    actualDepartAt: at.toISOString(),
    actualArrivalAt: logs[idx].actualArrivalAt ?? at.toISOString(),
  };
  if (idx + 1 >= logs.length) {
    return { ...state, status: "completed", logs, pauseStartedAt: null };
  }
  logs[idx + 1] = { ...logs[idx + 1], status: "en_route" };
  return {
    ...state,
    status: "running",
    currentIndex: idx + 1,
    logs,
    pauseStartedAt: null,
  };
}

export function toggleGiroPause(state: GiroRunState, at = new Date()): GiroRunState {
  if (state.status === "running") {
    return { ...state, status: "paused", pauseStartedAt: at.toISOString() };
  }
  if (state.status === "paused" && state.pauseStartedAt) {
    const paused = Math.max(
      0,
      Math.round((at.getTime() - new Date(state.pauseStartedAt).getTime()) / 1000),
    );
    return {
      ...state,
      status: "running",
      pauseStartedAt: null,
      totalPausedSeconds: state.totalPausedSeconds + paused,
    };
  }
  return state;
}

export function stopGiroRun(state: GiroRunState): GiroRunState {
  return {
    ...state,
    status: "idle",
    pauseStartedAt: null,
  };
}

export type GiroRunProjection = {
  /** Suggested leave time from current stop (arrival + dwell + extra delay) */
  suggestedDepartAt: string | null;
  /** Seconds until suggested depart (negative = overdue) */
  secondsToDepart: number | null;
  /** Recomputed ETA for next pending stops from "now" */
  nextEtas: Array<{ index: number; label: string; eta: string }>;
  arrivalLabel: string | null;
};

/**
 * Live helpers for the courier HUD: when to leave, and ETAs for what remains.
 */
export function projectGiroRun(
  state: GiroRunState,
  schedule: ScheduleStop[],
  now = new Date(),
): GiroRunProjection {
  const cur = state.logs[state.currentIndex];
  if (!cur) {
    return {
      suggestedDepartAt: null,
      secondsToDepart: null,
      nextEtas: [],
      arrivalLabel: null,
    };
  }

  let suggestedDepartAt: string | null = null;
  let secondsToDepart: number | null = null;
  let arrivalLabel: string | null = null;

  if (cur.status === "at_stop") {
    const arrived = cur.actualArrivalAt
      ? new Date(cur.actualArrivalAt).getTime()
      : now.getTime();
    const dwellMs =
      (cur.dwellMinutes + cur.extraDelayMinutes) * 60_000;
    const departMs = arrived + dwellMs;
    suggestedDepartAt = new Date(departMs).toISOString();
    secondsToDepart = Math.round((departMs - now.getTime()) / 1000);
    if (cur.arrivalDeltaSeconds != null) {
      const d = cur.arrivalDeltaSeconds;
      arrivalLabel =
        Math.abs(d) < 60
          ? "In orario"
          : d > 0
            ? `In ritardo di ${formatDuration(d)}`
            : `In anticipo di ${formatDuration(-d)}`;
    }
  }

  // Project remaining arrivals from now (or suggested depart).
  let clock =
    cur.status === "at_stop" && suggestedDepartAt
      ? new Date(suggestedDepartAt).getTime()
      : now.getTime();

  const nextEtas: Array<{ index: number; label: string; eta: string }> = [];
  for (let i = state.currentIndex; i < schedule.length; i++) {
    const log = state.logs[i];
    const row = schedule[i];
    if (!log || !row) continue;
    if (log.status === "done" || log.status === "skipped") continue;

    if (i === state.currentIndex && log.status === "at_stop") {
      // already there
      continue;
    }

    // Travel from previous
    if (i > 0) {
      clock += Math.max(0, row.legFromPreviousSeconds) * 1000;
    }
    nextEtas.push({
      index: i,
      label: row.place.label,
      eta: new Date(clock).toISOString(),
    });
    clock += Math.max(0, row.dwellMinutes ?? 0) * 60_000;
  }

  return { suggestedDepartAt, secondsToDepart, nextEtas, arrivalLabel };
}
