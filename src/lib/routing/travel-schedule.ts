import { haversineMeters } from "@/lib/utils/geometry";
import { formatDistance, formatDuration } from "@/lib/utils/format";
import type { RouteLeg } from "@/lib/types/route";
import type { PlaceRef } from "@/lib/types/trip";

/** Lock a visit in the sequence: free, fixed 1-based index, or always last. */
export type GiroPositionLock = "auto" | "last" | number;

export type GiroStop = {
  /** Stable UI / schedule id */
  id: string;
  place: PlaceRef;
  /** Optional desired arrival (ISO) */
  arriveBy: string | null;
  /** Service / stop time at this place before leaving for the next (minutes) */
  dwellMinutes: number;
  /** Where this stop must sit in the visit order */
  positionLock: GiroPositionLock;
};

export type ScheduleStop = {
  kind: "origin" | "stop" | "destination";
  place: PlaceRef;
  giroStopId?: string;
  /** ISO arrival (for origin = departure time) */
  arrivalAt: string;
  /** ISO departure after dwell (arrival + dwellMinutes) */
  departAt: string;
  /** Planned service time at this stop (minutes) */
  dwellMinutes: number;
  /** Travel time from the previous point (0 for origin) */
  legFromPreviousSeconds: number;
  /** Distance from the previous point in meters (0 for origin) */
  legFromPreviousMeters: number;
  cumulativeSeconds: number;
  /** Optional appointment the user set */
  arriveBy?: string | null;
  /** estimated − target (positive = late), seconds */
  vsArriveBySeconds?: number | null;
  /** True when duration came from haversine estimate, not the router */
  legEstimated?: boolean;
};

/**
 * Greedy nearest-neighbor order from a fixed start through all places.
 */
export function orderPlacesByNearestNeighbor(
  origin: PlaceRef,
  places: PlaceRef[],
): PlaceRef[] {
  const remaining = [...places];
  const ordered: PlaceRef[] = [];
  let current = origin.location;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(current, remaining[i].location);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = next.location;
  }

  return ordered;
}

function pickNearest(
  from: { lat: number; lng: number },
  candidates: GiroStop[],
): { stop: GiroStop; index: number } {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < candidates.length; i++) {
    const d = haversineMeters(from, candidates[i].place.location);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { stop: candidates[bestIdx], index: bestIdx };
}

/**
 * Insert/replace a position lock: the chosen stop takes `lock`, and any
 * stop already numbered at that slot (or after) shifts forward by one.
 * Example: A=1, B=2, C=3 → set D as 2 → A=1, D=2, B=3, C=4.
 */
export function assignGiroPositionLock(
  stops: GiroStop[],
  stopId: string,
  lock: GiroPositionLock,
): GiroStop[] {
  const n = stops.length;
  if (n === 0) return stops;
  if (!stops.some((s) => s.id === stopId)) return stops;

  if (lock === "auto") {
    return stops.map((s) =>
      s.id === stopId ? { ...s, positionLock: "auto" } : { ...s },
    );
  }

  if (lock === "last") {
    return stops.map((s) => {
      if (s.id === stopId) return { ...s, positionLock: "last" };
      if (s.positionLock === "last") return { ...s, positionLock: "auto" };
      return { ...s };
    });
  }

  const pos = Math.min(n, Math.max(1, Math.round(Number(lock))));
  const shifted: GiroStop[] = stops.map((s) => {
    if (s.id === stopId) return { ...s, positionLock: pos };
    if (typeof s.positionLock === "number" && s.positionLock >= pos) {
      const next = s.positionLock + 1;
      // Overflow past the tour length → keep as free (list order will settle).
      const positionLock: GiroPositionLock = next <= n ? next : "auto";
      return { ...s, positionLock };
    }
    return { ...s };
  });

  return sortGiroStopsByLock(shifted);
}

/** Stable list order: numeric locks ascending, then free, then «last». */
export function sortGiroStopsByLock(stops: GiroStop[]): GiroStop[] {
  const numbered: GiroStop[] = [];
  const free: GiroStop[] = [];
  const lasts: GiroStop[] = [];
  for (const s of stops) {
    if (s.positionLock === "last") lasts.push(s);
    else if (typeof s.positionLock === "number") numbered.push(s);
    else free.push(s);
  }
  numbered.sort(
    (a, b) => (a.positionLock as number) - (b.positionLock as number),
  );
  // Keep at most one «last»
  return [...numbered, ...free, ...lasts.slice(0, 1), ...lasts.slice(1).map((s) => ({ ...s, positionLock: "auto" as const }))];
}

/**
 * Place a stop into `slots` at `idx`, shifting existing occupants to the right
 * into the next empty slot (or the end).
 */
function insertSlotWithShift(
  slots: Array<GiroStop | null>,
  stop: GiroStop,
  idx: number,
): void {
  const n = slots.length;
  const i = Math.min(n - 1, Math.max(0, idx));
  if (slots[i] == null) {
    slots[i] = stop;
    return;
  }
  // Find first free slot at or after i; if none, find before end.
  let hole = -1;
  for (let j = i; j < n; j++) {
    if (slots[j] == null) {
      hole = j;
      break;
    }
  }
  if (hole === -1) {
    // All filled from i..end — should not happen if we place ≤ n stops.
    // Drop into first null anywhere.
    hole = slots.findIndex((s) => s == null);
    if (hole === -1) return;
    if (hole < i) {
      slots[hole] = stop;
      return;
    }
  }
  for (let j = hole; j > i; j--) {
    slots[j] = slots[j - 1];
  }
  slots[i] = stop;
}

/**
 * Order visits by proximity while honoring position locks
 * (`last`, or a 1-based slot like 9ª tappa).
 * Duplicate lock numbers shift the previous occupant forward.
 */
export function orderGiroStops(
  origin: PlaceRef,
  stops: GiroStop[],
): { ordered: GiroStop[]; warnings: string[] } {
  const n = stops.length;
  if (n === 0) return { ordered: [], warnings: [] };

  const warnings: string[] = [];
  const slots: Array<GiroStop | null> = Array.from({ length: n }, () => null);
  const free: GiroStop[] = [];

  const lastCandidates = stops.filter((s) => s.positionLock === "last");
  let lastStop: GiroStop | null = null;
  if (lastCandidates.length > 0) {
    lastStop = lastCandidates[0];
    if (lastCandidates.length > 1) {
      warnings.push(
        "Più tappe impostate come «ultima»: tengo solo l’ultima scelta, le altre sono libere.",
      );
      free.push(...lastCandidates.slice(0, -1));
      lastStop = lastCandidates[lastCandidates.length - 1];
    }
  }

  const claimed = new Set<string>();
  if (lastStop) claimed.add(lastStop.id);

  // Place higher lock numbers first so lower inserts can shift them right.
  const numbered = stops
    .filter(
      (s) =>
        !claimed.has(s.id) &&
        typeof s.positionLock === "number" &&
        Number.isFinite(s.positionLock),
    )
    .sort(
      (a, b) => (b.positionLock as number) - (a.positionLock as number),
    );

  for (const s of numbered) {
    const idx = Math.min(n, Math.max(1, Math.round(s.positionLock as number))) - 1;
    if (slots[idx] == null) {
      slots[idx] = s;
    } else {
      insertSlotWithShift(slots, s, idx);
      warnings.push(
        `Posizione ${idx + 1}: «${s.place.label}» inserita, le tappe successive scorrono avanti.`,
      );
    }
    claimed.add(s.id);
  }

  for (const s of stops) {
    if (!claimed.has(s.id)) free.push(s);
  }

  if (lastStop) {
    const endSlot = slots[n - 1];
    if (endSlot == null) {
      slots[n - 1] = lastStop;
    } else if (endSlot.id !== lastStop.id) {
      // Shift last occupant left into a hole if possible, else demote to free.
      insertSlotWithShift(slots, lastStop, n - 1);
      // Ensure lastStop ends at the end: swap if needed
      const at = slots.findIndex((x) => x?.id === lastStop!.id);
      if (at >= 0 && at !== n - 1) {
        const tmp = slots[n - 1];
        slots[n - 1] = slots[at];
        slots[at] = tmp;
      }
    }
  }

  let current = origin.location;
  for (let i = 0; i < n; i++) {
    if (slots[i] != null) {
      current = slots[i]!.place.location;
      continue;
    }
    if (free.length === 0) break;
    const { stop, index } = pickNearest(current, free);
    free.splice(index, 1);
    slots[i] = stop;
    current = stop.place.location;
  }

  for (let i = 0; i < n; i++) {
    if (slots[i] == null && free.length > 0) {
      slots[i] = free.shift()!;
    }
  }

  const ordered = slots.filter((s): s is GiroStop => s != null);
  return { ordered, warnings };
}

export function giroHasHardLocks(stops: GiroStop[]): boolean {
  return stops.some(
    (s) => s.positionLock === "last" || typeof s.positionLock === "number",
  );
}

/** Reorder intermediates using Google’s optimizedIntermediateWaypointIndex. */
export function applyOptimizedIntermediateOrder(
  intermediates: PlaceRef[],
  order: number[] | undefined,
): PlaceRef[] {
  if (!order || order.length !== intermediates.length) return intermediates;
  const next = order
    .map((i) => intermediates[i])
    .filter((p): p is PlaceRef => Boolean(p));
  return next.length === intermediates.length ? next : intermediates;
}

/** Rough urban drive time when the router did not return a leg (~32 km/h). */
export function estimateLegSeconds(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { seconds: number; meters: number } {
  const meters = Math.max(0, Math.round(haversineMeters(from, to)));
  const seconds = Math.max(60, Math.round(meters / (32_000 / 3600)));
  return { seconds, meters };
}

/**
 * Build clock arrivals from departure + route legs.
 * `orderedStops` = visits in route order (intermediates then destination).
 * Missing legs fall back to a distance-based estimate so “tempo tra tappe”
 * is always available in Giro / PDF.
 */
export function buildArrivalSchedule(params: {
  departureAt: string;
  origin: PlaceRef;
  orderedPlaces: PlaceRef[];
  legs: RouteLeg[];
  /** Optional giro metadata aligned with orderedPlaces */
  orderedGiroStops?: GiroStop[];
  /** Loading time at origin before the first leg (minutes) */
  originDwellMinutes?: number;
}): ScheduleStop[] {
  const startMs = new Date(params.departureAt).getTime();
  const safeStart = Number.isFinite(startMs) ? startMs : Date.now();
  const originDwell = Math.max(0, Math.round(params.originDwellMinutes ?? 0));

  let clockMs = safeStart;
  const originDepartMs = clockMs + originDwell * 60_000;
  const rows: ScheduleStop[] = [
    {
      kind: "origin",
      place: params.origin,
      arrivalAt: new Date(clockMs).toISOString(),
      departAt: new Date(originDepartMs).toISOString(),
      dwellMinutes: originDwell,
      legFromPreviousSeconds: 0,
      legFromPreviousMeters: 0,
      cumulativeSeconds: 0,
    },
  ];
  clockMs = originDepartMs;

  let prevLoc = params.origin.location;
  for (let i = 0; i < params.orderedPlaces.length; i++) {
    const place = params.orderedPlaces[i];
    const giro = params.orderedGiroStops?.[i];
    const routerLeg = params.legs[i];
    const estimated = estimateLegSeconds(prevLoc, place.location);
    const hasRouterDuration =
      routerLeg != null &&
      Number.isFinite(routerLeg.durationSeconds) &&
      routerLeg.durationSeconds > 0;
    const legSeconds = hasRouterDuration
      ? Math.max(0, routerLeg.durationSeconds)
      : estimated.seconds;
    const legMeters =
      routerLeg != null &&
      Number.isFinite(routerLeg.distanceMeters) &&
      routerLeg.distanceMeters > 0
        ? Math.max(0, Math.round(routerLeg.distanceMeters))
        : estimated.meters;

    clockMs += legSeconds * 1000;
    const arrivalAt = new Date(clockMs).toISOString();
    const dwellMinutes = Math.max(0, Math.round(giro?.dwellMinutes ?? 0));
    const departMs = clockMs + dwellMinutes * 60_000;
    const departAt = new Date(departMs).toISOString();
    const cumulativeSeconds = Math.round((clockMs - safeStart) / 1000);

    const arriveBy = giro?.arriveBy ?? null;
    let vsArriveBySeconds: number | null = null;
    if (arriveBy) {
      const target = new Date(arriveBy).getTime();
      if (Number.isFinite(target)) {
        vsArriveBySeconds = Math.round(
          (new Date(arrivalAt).getTime() - target) / 1000,
        );
      }
    }
    rows.push({
      kind: i === params.orderedPlaces.length - 1 ? "destination" : "stop",
      place,
      giroStopId: giro?.id,
      arrivalAt,
      departAt,
      dwellMinutes,
      legFromPreviousSeconds: legSeconds,
      legFromPreviousMeters: legMeters,
      cumulativeSeconds,
      arriveBy,
      vsArriveBySeconds,
      legEstimated: !hasRouterDuration,
    });
    clockMs = departMs;
    prevLoc = place.location;
  }

  return rows;
}

/** Compact “12 min · 4,2 km” for UI / PDF between two stops. */
export function formatLegTravelLabel(row: ScheduleStop): string | null {
  if (row.legFromPreviousSeconds <= 0 && row.legFromPreviousMeters <= 0) {
    return null;
  }
  const parts: string[] = [];
  if (row.legFromPreviousSeconds > 0) {
    parts.push(formatDuration(row.legFromPreviousSeconds));
  }
  if (row.legFromPreviousMeters > 0) {
    parts.push(formatDistance(row.legFromPreviousMeters));
  }
  if (parts.length === 0) return null;
  const base = parts.join(" · ");
  return row.legEstimated ? `${base} (stima)` : base;
}

export type GiroOrderAlternative = {
  /** Stop ids in the free window, new order */
  orderIds: string[];
  labels: string[];
  estimatedSeconds: number;
  deltaSeconds: number;
};

export type GiroFlexibleWindow = {
  /** Inclusive indices into the ordered visit list (not including origin) */
  start: number;
  end: number;
  /** Anchor before the free window (origin or a fixed stop) */
  beforeLabel: string;
  /** Anchor after the free window (fixed stop or “fine giro”) */
  afterLabel: string;
  currentOrderIds: string[];
  currentLabels: string[];
  currentSeconds: number;
  alternatives: GiroOrderAlternative[];
};

function isHardLocked(stop: GiroStop): boolean {
  return stop.positionLock === "last" || typeof stop.positionLock === "number";
}

function pathSeconds(points: Array<{ lat: number; lng: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += estimateLegSeconds(points[i - 1], points[i]).seconds;
  }
  return total;
}

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  if (items.length > 4) return []; // handled by candidate heuristics
  const out: T[][] = [];
  const used = new Array(items.length).fill(false);
  const cur: T[] = [];
  function dfs() {
    if (cur.length === items.length) {
      out.push([...cur]);
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(items[i]);
      dfs();
      cur.pop();
      used[i] = false;
    }
  }
  dfs();
  return out;
}

/** Limited reorder candidates when a free window has 5+ stops. */
function heuristicOrders<T>(items: T[]): T[][] {
  const out: T[][] = [[...items]];
  // Adjacent swaps
  for (let i = 0; i < items.length - 1; i++) {
    const next = [...items];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    out.push(next);
  }
  // Reverse window
  out.push([...items].reverse());
  // Move first to end / last to front
  if (items.length >= 3) {
    out.push([...items.slice(1), items[0]]);
    out.push([items[items.length - 1], ...items.slice(0, -1)]);
  }
  return out;
}

function uniqueOrdersByIds(orders: GiroStop[][]): GiroStop[][] {
  const seen = new Set<string>();
  const out: GiroStop[][] = [];
  for (const order of orders) {
    const key = order.map((s) => s.id).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(order);
  }
  return out;
}

/**
 * Free stops between hard-locked anchors can be reordered.
 * Returns windows with alternative sequences ranked by estimated travel time.
 */
export function findGiroFlexibleWindows(
  origin: PlaceRef,
  ordered: GiroStop[],
  maxAlternatives = 4,
): GiroFlexibleWindow[] {
  if (ordered.length < 2) return [];

  const windows: GiroFlexibleWindow[] = [];
  let i = 0;
  while (i < ordered.length) {
    if (isHardLocked(ordered[i])) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < ordered.length && !isHardLocked(ordered[i])) i += 1;
    const end = i - 1;
    if (end - start < 1) continue; // need at least 2 free stops

    const free = ordered.slice(start, end + 1);
    const before = start === 0 ? origin : ordered[start - 1].place;
    const after =
      end + 1 < ordered.length ? ordered[end + 1].place : null;
    const beforeLabel = start === 0 ? origin.label : ordered[start - 1].place.label;
    const afterLabel = after?.label ?? "Fine giro";

    const score = (seq: GiroStop[]) =>
      pathSeconds([
        before.location,
        ...seq.map((s) => s.place.location),
        ...(after ? [after.location] : []),
      ]);

    const currentSeconds = score(free);
    const candidates =
      free.length <= 4 ? permute(free) : heuristicOrders(free);
    const alternatives = uniqueOrdersByIds(candidates)
      .filter((seq) => seq.map((s) => s.id).join("|") !== free.map((s) => s.id).join("|"))
      .map((seq) => {
        const estimatedSeconds = score(seq);
        return {
          orderIds: seq.map((s) => s.id),
          labels: seq.map((s) => s.place.label),
          estimatedSeconds,
          deltaSeconds: estimatedSeconds - currentSeconds,
        };
      })
      .sort((a, b) => a.estimatedSeconds - b.estimatedSeconds)
      .slice(0, maxAlternatives);

    if (alternatives.length === 0) continue;

    windows.push({
      start,
      end,
      beforeLabel,
      afterLabel,
      currentOrderIds: free.map((s) => s.id),
      currentLabels: free.map((s) => s.place.label),
      currentSeconds,
      alternatives,
    });
  }

  return windows;
}

/** Apply a free-window reorder onto the full ordered visit list. */
export function applyGiroWindowOrder(
  ordered: GiroStop[],
  window: Pick<GiroFlexibleWindow, "start" | "end">,
  orderIds: string[],
): GiroStop[] {
  const slice = ordered.slice(window.start, window.end + 1);
  if (slice.length !== orderIds.length) return ordered;
  const byId = new Map(slice.map((s) => [s.id, s]));
  const nextSlice: GiroStop[] = [];
  for (const id of orderIds) {
    const stop = byId.get(id);
    if (!stop) return ordered;
    nextSlice.push(stop);
  }
  return [
    ...ordered.slice(0, window.start),
    ...nextSlice,
    ...ordered.slice(window.end + 1),
  ];
}
