import type { GiroStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";

export type SavedGiro = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  origin: PlaceRef | null;
  departureAt: string | null;
  stops: GiroStop[];
};

const STORAGE_KEY = "itinera.savedGiri.v1";
const MAX_ENTRIES = 40;

function readAll(): SavedGiro[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedGiro[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: SavedGiro[]): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(entries.slice(0, MAX_ENTRIES)),
  );
}

export function listSavedGiri(): SavedGiro[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSavedGiro(id: string): SavedGiro | null {
  return readAll().find((g) => g.id === id) ?? null;
}

export function suggestGiroTitle(input: {
  origin: PlaceRef | null;
  stops: GiroStop[];
}): string {
  const labels = [
    input.origin?.label,
    ...input.stops.map((s) => s.place.label),
  ].filter(Boolean) as string[];
  if (labels.length === 0) return "Nuovo giro";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} → ${labels[1]}`;
  return `${labels[0]} → … → ${labels[labels.length - 1]} (${labels.length} tappe)`;
}

export function saveGiro(input: {
  id?: string;
  title?: string;
  origin: PlaceRef | null;
  departureAt: string | null;
  stops: GiroStop[];
}): SavedGiro {
  const now = new Date().toISOString();
  const all = readAll();
  const existing = input.id ? all.find((g) => g.id === input.id) : undefined;
  const title =
    input.title?.trim() ||
    existing?.title ||
    suggestGiroTitle({ origin: input.origin, stops: input.stops });

  const entry: SavedGiro = {
    id: existing?.id ?? crypto.randomUUID(),
    title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    origin: input.origin ? structuredClone(input.origin) : null,
    departureAt: input.departureAt,
    stops: structuredClone(input.stops),
  };

  const next = [entry, ...all.filter((g) => g.id !== entry.id)];
  writeAll(next);
  return entry;
}

export function removeSavedGiro(id: string): void {
  writeAll(readAll().filter((g) => g.id !== id));
}

export function clearSavedGiri(): void {
  writeAll([]);
}
