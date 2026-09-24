import type { PlaceRef } from "@/lib/types/trip";

export type SavedPlaceKind = "favorite" | "parking" | "home" | "work" | "other";

export interface SavedPlace {
  id: string;
  kind: SavedPlaceKind;
  label: string;
  note?: string;
  place: PlaceRef;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "itinera.savedPlaces.v1";

function readAll(): SavedPlace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPlace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(places: SavedPlace[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
}

export function listSavedPlaces(): SavedPlace[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveSavedPlace(
  input: Omit<SavedPlace, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): SavedPlace {
  const now = new Date().toISOString();
  const all = readAll();
  const existing = input.id
    ? all.find((p) => p.id === input.id)
    : undefined;
  const next: SavedPlace = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: input.kind,
    label: input.label.trim() || input.place.label,
    note: input.note?.trim() || undefined,
    place: input.place,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeAll([...all.filter((p) => p.id !== next.id), next]);
  return next;
}

export function removeSavedPlace(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function savedPlaceKindLabel(kind: SavedPlaceKind): string {
  switch (kind) {
    case "parking":
      return "Parcheggio";
    case "favorite":
      return "Preferito";
    case "home":
      return "Casa";
    case "work":
      return "Lavoro";
    case "other":
      return "Altro";
  }
}
