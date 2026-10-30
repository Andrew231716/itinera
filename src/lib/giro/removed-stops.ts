import type { GiroStop } from "@/lib/routing/travel-schedule";

export type RemovedGiroEntry = {
  stop: GiroStop;
  removedAt: string;
};

export const MAX_REMOVED_GIRO_STOPS = 12;

/** Newest first; drops duplicate of the same stop id if re-removed. */
export function pushRemovedGiroStop(
  list: RemovedGiroEntry[],
  stop: GiroStop,
  at = new Date(),
  max = MAX_REMOVED_GIRO_STOPS,
): RemovedGiroEntry[] {
  const entry: RemovedGiroEntry = {
    stop: structuredClone(stop),
    removedAt: at.toISOString(),
  };
  const without = list.filter((e) => e.stop.id !== stop.id);
  return [entry, ...without].slice(0, Math.max(1, max));
}

/** Pull one entry out for restore; returns null if id unknown. */
export function takeRemovedGiroStop(
  list: RemovedGiroEntry[],
  stopId: string,
): { next: RemovedGiroEntry[]; stop: GiroStop } | null {
  const idx = list.findIndex((e) => e.stop.id === stopId);
  if (idx < 0) return null;
  const entry = list[idx];
  return {
    next: [...list.slice(0, idx), ...list.slice(idx + 1)],
    stop: structuredClone(entry.stop),
  };
}

export function placeKeyOf(place: {
  placeId?: string | null;
  location: { lat: number; lng: number };
}): string {
  return (
    place.placeId ??
    `${place.location.lat.toFixed(5)},${place.location.lng.toFixed(5)}`
  );
}

/**
 * Reinsert a removed stop as it was. Skips if the same place is already
 * in the tour (returns `duplicate`).
 */
export function restoreGiroStop(
  stops: GiroStop[],
  removed: RemovedGiroEntry[],
  stopId: string,
):
  | { ok: true; stops: GiroStop[]; removed: RemovedGiroEntry[] }
  | { ok: false; reason: "missing" | "duplicate" } {
  const taken = takeRemovedGiroStop(removed, stopId);
  if (!taken) return { ok: false, reason: "missing" };
  const key = placeKeyOf(taken.stop.place);
  if (stops.some((s) => placeKeyOf(s.place) === key)) {
    return { ok: false, reason: "duplicate" };
  }
  // Drop any leftover with the same id, then append the snapshot.
  const cleaned = stops.filter((s) => s.id !== taken.stop.id);
  return {
    ok: true,
    stops: [...cleaned, taken.stop],
    removed: taken.next,
  };
}
