import type { GiroStop, ScheduleStop } from "@/lib/routing/travel-schedule";
import {
  DEFAULT_ROAD_PREFERENCES,
  type PlaceRef,
  type RoadPreferences,
  type TravelMode,
} from "@/lib/types/trip";

export type SavedGiro = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  origin: PlaceRef | null;
  departureAt: string | null;
  stops: GiroStop[];
  /** Snapshot of travel rules at save time */
  preferences: RoadPreferences;
  travelMode: TravelMode;
  /** ETA / appointment schedule when the giro was last computed */
  schedule: ScheduleStop[] | null;
};

const STORAGE_KEY = "itinera.savedGiri.v2";
const LEGACY_KEY = "itinera.savedGiri.v1";
const MAX_ENTRIES = 40;

function normalizeEntry(raw: Partial<SavedGiro> & { id?: string }): SavedGiro | null {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  const stops = Array.isArray(raw.stops) ? raw.stops : [];
  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Giro",
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date().toISOString(),
    origin: raw.origin ?? null,
    departureAt: raw.departureAt ?? null,
    stops: structuredClone(stops).map((s) => ({
      ...s,
      dwellMinutes:
        typeof s.dwellMinutes === "number" && Number.isFinite(s.dwellMinutes)
          ? Math.max(0, Math.round(s.dwellMinutes))
          : 0,
    })),
    preferences: {
      ...DEFAULT_ROAD_PREFERENCES,
      ...(raw.preferences ?? {}),
    },
    travelMode: raw.travelMode ?? "DRIVE",
    schedule: Array.isArray(raw.schedule)
      ? structuredClone(raw.schedule).map((row) => ({
          ...row,
          dwellMinutes:
            typeof row.dwellMinutes === "number" ? row.dwellMinutes : 0,
          departAt:
            typeof row.departAt === "string"
              ? row.departAt
              : row.arrivalAt,
          legFromPreviousMeters:
            typeof row.legFromPreviousMeters === "number"
              ? row.legFromPreviousMeters
              : 0,
        }))
      : null,
  };
}

function readAll(): SavedGiro[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((e) => normalizeEntry(e as Partial<SavedGiro>))
        .filter((e): e is SavedGiro => e != null);
    }
    // Migrate v1 → v2 once
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const migrated = parsed
      .map((e) => normalizeEntry(e as Partial<SavedGiro>))
      .filter((e): e is SavedGiro => e != null);
    writeAll(migrated);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
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
  preferences?: RoadPreferences;
  travelMode?: TravelMode;
  schedule?: ScheduleStop[] | null;
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
    preferences: {
      ...DEFAULT_ROAD_PREFERENCES,
      ...(input.preferences ?? existing?.preferences ?? {}),
    },
    travelMode: input.travelMode ?? existing?.travelMode ?? "DRIVE",
    schedule:
      input.schedule !== undefined
        ? input.schedule
          ? structuredClone(input.schedule)
          : null
        : existing?.schedule
          ? structuredClone(existing.schedule)
          : null,
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
