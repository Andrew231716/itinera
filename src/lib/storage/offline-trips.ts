import type { TripDraft } from "@/lib/types/trip";
import type { ComputedRoute } from "@/lib/types/route";

export interface OfflineTripPack {
  id: string;
  savedAt: string;
  title: string;
  trip: TripDraft;
  routes: ComputedRoute[];
  selectedRouteId: string | null;
  /** Bytes estimate for UI */
  sizeBytes: number;
}

const STORAGE_KEY = "itinera.offlineTrips.v1";
const MAX_PACKS = 12;

function readAll(): OfflineTripPack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineTripPack[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(packs: OfflineTripPack[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packs.slice(0, MAX_PACKS)));
}

function estimateSize(pack: Omit<OfflineTripPack, "sizeBytes">): number {
  try {
    return new Blob([JSON.stringify(pack)]).size;
  } catch {
    return JSON.stringify(pack).length;
  }
}

export function listOfflineTrips(): OfflineTripPack[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getOfflineTrip(id: string): OfflineTripPack | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export function saveOfflineTrip(input: {
  trip: TripDraft;
  routes: ComputedRoute[];
  selectedRouteId: string | null;
}): OfflineTripPack {
  const base = {
    id: input.trip.meta.id,
    savedAt: new Date().toISOString(),
    title: input.trip.meta.title || "Viaggio offline",
    trip: input.trip,
    routes: input.routes,
    selectedRouteId: input.selectedRouteId,
  };
  const pack: OfflineTripPack = {
    ...base,
    sizeBytes: estimateSize(base),
  };
  const others = readAll().filter((p) => p.id !== pack.id);
  writeAll([pack, ...others]);
  return pack;
}

export function removeOfflineTrip(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function formatOfflineSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
