import type { TripDraft } from "@/lib/types/trip";

export interface TripRepository {
  list(): Promise<TripDraft[]>;
  get(id: string): Promise<TripDraft | null>;
  save(trip: TripDraft): Promise<TripDraft>;
  duplicate(id: string): Promise<TripDraft | null>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = "itinera.trips.v1";

function readAll(): TripDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TripDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(trips: TripDraft[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

/**
 * Local persistence until Supabase is wired (Phase 5).
 */
export class LocalTripRepository implements TripRepository {
  async list(): Promise<TripDraft[]> {
    return readAll().sort((a, b) =>
      b.meta.updatedAt.localeCompare(a.meta.updatedAt),
    );
  }

  async get(id: string): Promise<TripDraft | null> {
    return readAll().find((t) => t.meta.id === id) ?? null;
  }

  async save(trip: TripDraft): Promise<TripDraft> {
    const next = {
      ...trip,
      meta: { ...trip.meta, updatedAt: new Date().toISOString() },
    };
    const all = readAll().filter((t) => t.meta.id !== next.meta.id);
    all.push(next);
    writeAll(all);
    return next;
  }

  async duplicate(id: string): Promise<TripDraft | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const copy: TripDraft = {
      ...structuredClone(existing),
      meta: {
        id: crypto.randomUUID(),
        title: `${existing.meta.title} (copia)`,
        createdAt: now,
        updatedAt: now,
      },
      selectedRouteId: null,
    };
    return this.save(copy);
  }

  async remove(id: string): Promise<void> {
    writeAll(readAll().filter((t) => t.meta.id !== id));
  }
}

/**
 * Scaffold for Phase 5 — throws until Supabase env is configured.
 */
export class SupabaseTripRepository implements TripRepository {
  async list(): Promise<TripDraft[]> {
    throw new Error(
      "Supabase non configurato. Imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  async get(): Promise<TripDraft | null> {
    throw new Error("Supabase non configurato.");
  }
  async save(): Promise<TripDraft> {
    throw new Error("Supabase non configurato.");
  }
  async duplicate(): Promise<TripDraft | null> {
    throw new Error("Supabase non configurato.");
  }
  async remove(): Promise<void> {
    throw new Error("Supabase non configurato.");
  }
}

export function getTripRepository(): TripRepository {
  return new LocalTripRepository();
}
