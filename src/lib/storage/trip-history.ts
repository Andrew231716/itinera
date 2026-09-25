import type { TripDraft } from "@/lib/types/trip";

export interface TripHistoryRouteSummary {
  label?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  tollEstimate?: number;
  tollCurrency?: string;
  mode: "live" | "demo";
}

export interface TripHistoryEntry {
  id: string;
  computedAt: string;
  /** Stable key for the same OD / stops / mode / prefs */
  fingerprint: string;
  trip: TripDraft;
  routeSummary?: TripHistoryRouteSummary;
}

const STORAGE_KEY = "itinera.tripHistory.v1";
const MAX_ENTRIES = 40;

function readAll(): TripHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TripHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: TripHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

function placeKey(place: {
  placeId?: string;
  location: { lat: number; lng: number };
  label: string;
} | null): string {
  if (!place) return "";
  if (place.placeId) return `pid:${place.placeId}`;
  return `ll:${place.location.lat.toFixed(4)},${place.location.lng.toFixed(4)}`;
}

/** Build a fingerprint so repeated calcoli dello stesso itinerario aggiornano la cronologia. */
export function tripHistoryFingerprint(trip: TripDraft): string {
  const stops = trip.stops
    .map((s) => placeKey(s.place))
    .join("|");
  const prefs = [
    trip.preferences.avoidTolls ? "toll" : "",
    trip.preferences.avoidHighways ? "hwy" : "",
    trip.preferences.avoidFerries ? "ferry" : "",
    trip.preferences.preferShortest ? "short" : "fast",
  ]
    .filter(Boolean)
    .join(",");
  const excl = trip.exclusions
    .map((e) => e.id)
    .sort()
    .join(",");
  return [
    placeKey(trip.origin),
    placeKey(trip.destination),
    stops,
    trip.travelMode,
    prefs,
    excl,
  ].join("::");
}

export function listTripHistory(): TripHistoryEntry[] {
  return readAll().sort((a, b) => b.computedAt.localeCompare(a.computedAt));
}

export function recordTripHistory(input: {
  trip: TripDraft;
  routeSummary?: TripHistoryRouteSummary;
}): TripHistoryEntry {
  const now = new Date().toISOString();
  const fingerprint = tripHistoryFingerprint(input.trip);
  const all = readAll();
  const existing = all.find((e) => e.fingerprint === fingerprint);

  const snapshot: TripDraft = structuredClone({
    ...input.trip,
    // Keep original trip id so "salva" can still update the same draft if open.
  });

  const next: TripHistoryEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    computedAt: now,
    fingerprint,
    trip: snapshot,
    routeSummary: input.routeSummary ?? existing?.routeSummary,
  };

  writeAll([next, ...all.filter((e) => e.id !== next.id)]);
  return next;
}

export function getTripHistoryEntry(id: string): TripHistoryEntry | null {
  return readAll().find((e) => e.id === id) ?? null;
}

export function removeTripHistoryEntry(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

export function clearTripHistory(): void {
  writeAll([]);
}
