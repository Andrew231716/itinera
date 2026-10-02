import type { TripDraft } from "@/lib/types/trip";
import {
  createBrowserSupabaseClient,
  createServerSupabaseClient,
  getOrCreateClientOwnerKey,
  isSupabaseConfigured,
} from "@/lib/storage/supabase-client";

export interface ShareRecord {
  token: string;
  tripId: string;
  permission: "read";
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  urlPath: string;
}

export interface TripRepository {
  list(): Promise<TripDraft[]>;
  get(id: string): Promise<TripDraft | null>;
  save(trip: TripDraft): Promise<TripDraft>;
  duplicate(id: string): Promise<TripDraft | null>;
  remove(id: string): Promise<void>;
  createShare?(tripId: string, expiresAt?: string | null): Promise<ShareRecord>;
  revokeShare?(token: string): Promise<void>;
  getByShareToken?(token: string): Promise<TripDraft | null>;
}

const STORAGE_KEY = "itinera.trips.v1";
const SHARE_KEY = "itinera.shares.v1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cloneValue<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function makeTripId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `trip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePoint(value: unknown): { lat: number; lng: number } | null {
  if (!isObject(value)) return null;
  const lat = safeNumber(value.lat);
  const lng = safeNumber(value.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function normalizePlace(value: unknown): TripDraft["origin"] {
  if (!isObject(value)) return null;
  const location = normalizePoint(value.location);
  if (!location) return null;
  return {
    id: safeString(value.id, makeTripId()),
    label: safeString(value.label, "Posizione"),
    address: typeof value.address === "string" ? value.address : undefined,
    placeId: typeof value.placeId === "string" ? value.placeId : undefined,
    location,
    source:
      value.source === "places" ||
      value.source === "map_click" ||
      value.source === "manual" ||
      value.source === "demo" ||
      value.source === "assistant" ||
      value.source === "gps"
        ? value.source
        : "manual",
  };
}

function normalizeStops(value: unknown): TripDraft["stops"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const place = normalizePlace(entry.place);
    if (!place) return [];
    const dwellMinutes = safeNumber(entry.dwellMinutes);
    return [{
      id: safeString(entry.id, makeTripId()),
      place,
      dwellMinutes: dwellMinutes ?? undefined,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
    }];
  });
}

function normalizePreferences(value: unknown): TripDraft["preferences"] {
  const fallback = {
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false,
    avoidTunnels: false,
    preferFastest: true,
    preferShortest: false,
    preferScenic: false,
    maxExtraMinutes: null,
  };
  if (!isObject(value)) return fallback;
  return {
    avoidTolls: Boolean(value.avoidTolls),
    avoidHighways: Boolean(value.avoidHighways),
    avoidFerries: Boolean(value.avoidFerries),
    avoidTunnels: Boolean(value.avoidTunnels),
    preferFastest: Boolean(value.preferFastest),
    preferShortest: Boolean(value.preferShortest),
    preferScenic: Boolean(value.preferScenic),
    maxExtraMinutes: safeNumber(value.maxExtraMinutes),
  };
}

function normalizeTripDraft(raw: unknown): TripDraft | null {
  if (!isObject(raw) || !isObject(raw.meta)) return null;

  const meta = raw.meta;
  const tract = {
    meta: {
      id: safeString(meta.id, makeTripId()),
      title: safeString(meta.title, "Viaggio"),
      createdAt: safeString(meta.createdAt, new Date().toISOString()),
      updatedAt: safeString(meta.updatedAt, new Date().toISOString()),
    },
    origin: normalizePlace(raw.origin),
    destination: normalizePlace(raw.destination),
    stops: normalizeStops(raw.stops),
    departureAt: typeof raw.departureAt === "string" ? raw.departureAt : null,
    travelMode:
      raw.travelMode === "DRIVE" ||
      raw.travelMode === "WALK" ||
      raw.travelMode === "BICYCLE" ||
      raw.travelMode === "TRANSIT" ||
      raw.travelMode === "TWO_WHEELER"
        ? raw.travelMode
        : "DRIVE",
    preferences: normalizePreferences(raw.preferences),
    exclusions: Array.isArray(raw.exclusions) ? raw.exclusions.filter(Boolean) as TripDraft["exclusions"] : [],
    optimizeStopOrder: Boolean(raw.optimizeStopOrder),
    selectedRouteId: typeof raw.selectedRouteId === "string" ? raw.selectedRouteId : null,
  };

  return tract;
}

function readAll(): TripDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeTripDraft)
      .filter((entry): entry is TripDraft => entry !== null);
  } catch {
    return [];
  }
}

function writeAll(trips: TripDraft[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

function readShares(): ShareRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHARE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is ShareRecord =>
        isObject(entry) &&
        typeof entry.token === "string" &&
        typeof entry.tripId === "string" &&
        typeof entry.createdAt === "string" &&
        typeof entry.permission === "string",
    );
  } catch {
    return [];
  }
}

function writeShares(shares: ShareRecord[]): void {
  localStorage.setItem(SHARE_KEY, JSON.stringify(shares));
}

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
      ...cloneValue(trip),
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
      ...cloneValue(existing),
      meta: {
        id: makeTripId(),
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
    writeShares(readShares().filter((s) => s.tripId !== id));
  }

  async createShare(tripId: string, expiresAt: string | null = null): Promise<ShareRecord> {
    const trip = await this.get(tripId);
    if (!trip) throw new Error("Viaggio non trovato.");
    const token = `${makeTripId().replace(/-/g, "")}${makeTripId().replace(/-/g, "")}`;
    const record: ShareRecord = {
      token,
      tripId,
      permission: "read",
      createdAt: new Date().toISOString(),
      expiresAt,
      revokedAt: null,
      urlPath: `/share/${token}`,
    };
    localStorage.setItem(
      `itinera.share.snapshot.${token}`,
      JSON.stringify(cloneValue(trip)),
    );
    writeShares([record, ...readShares()]);
    return record;
  }

  async revokeShare(token: string): Promise<void> {
    writeShares(
      readShares().map((s) =>
        s.token === token ? { ...s, revokedAt: new Date().toISOString() } : s,
      ),
    );
  }

  async getByShareToken(token: string): Promise<TripDraft | null> {
    const share = readShares().find((s) => s.token === token);
    if (!share || share.revokedAt) return null;
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      return null;
    }
    try {
      const raw = localStorage.getItem(`itinera.share.snapshot.${token}`);
      if (!raw) return this.get(share.tripId);
      return normalizeTripDraft(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}

export class SupabaseTripRepository implements TripRepository {
  constructor(private readonly clientOwnerKey?: string) {}

  private client() {
    const c = createBrowserSupabaseClient();
    if (!c) {
      throw new Error(
        "Supabase non configurato. Imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    return c;
  }

  async list(): Promise<TripDraft[]> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("trips")
      .select("trip_data")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as { trip_data: TripDraft }[] | null)?.map((r) => normalizeTripDraft(r.trip_data) ?? r.trip_data) ?? [];
  }

  async get(id: string): Promise<TripDraft | null> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("trips")
      .select("trip_data")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return normalizeTripDraft((data as { trip_data: TripDraft } | null)?.trip_data ?? null);
  }

  async save(trip: TripDraft): Promise<TripDraft> {
    const supabase = this.client();
    const next = {
      ...cloneValue(trip),
      meta: { ...trip.meta, updatedAt: new Date().toISOString() },
    };
    const { data: { user } } = await supabase.auth.getUser();

    const row = {
      id: next.meta.id,
      title: next.meta.title,
      trip_data: next,
      owner_id: user?.id ?? null,
      client_owner_key: user ? null : this.clientOwnerKey ?? getOrCreateClientOwnerKey(),
      updated_at: next.meta.updatedAt,
    };

    const { error } = await supabase.from("trips").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return next;
  }

  async duplicate(id: string): Promise<TripDraft | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const copy: TripDraft = {
      ...cloneValue(existing),
      meta: {
        id: makeTripId(),
        title: `${existing.meta.title} (copia)`,
        createdAt: now,
        updatedAt: now,
      },
      selectedRouteId: null,
    };
    return this.save(copy);
  }

  async remove(id: string): Promise<void> {
    const supabase = this.client();
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async createShare(tripId: string, expiresAt: string | null = null): Promise<ShareRecord> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("shared_trips")
      .insert({
        trip_id: tripId,
        permission: "read",
        expires_at: expiresAt,
      })
      .select("share_token, trip_id, permission, created_at, expires_at, revoked_at")
      .single();
    if (error) throw new Error(error.message);
    const row = data as {
      share_token: string;
      trip_id: string;
      permission: "read";
      created_at: string;
      expires_at: string | null;
      revoked_at: string | null;
    };
    return {
      token: row.share_token,
      tripId: row.trip_id,
      permission: row.permission,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      urlPath: `/share/${row.share_token}`,
    };
  }

  async revokeShare(token: string): Promise<void> {
    const supabase = this.client();
    const { error } = await supabase
      .from("shared_trips")
      .update({ revoked_at: new Date().toISOString() })
      .eq("share_token", token);
    if (error) throw new Error(error.message);
  }

  async getByShareToken(token: string): Promise<TripDraft | null> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc("get_shared_trip", {
      p_token: token,
    });
    if (error) throw new Error(error.message);
    if (!data) return null;
    const payload = data as { trip?: TripDraft };
    return normalizeTripDraft(payload.trip ?? null);
  }
}

export class HybridTripRepository implements TripRepository {
  private local = new LocalTripRepository();

  private remote(): SupabaseTripRepository | null {
    if (!isSupabaseConfigured()) return null;
    return new SupabaseTripRepository(getOrCreateClientOwnerKey());
  }

  async list(): Promise<TripDraft[]> {
    const remote = this.remote();
    if (remote) {
      try {
        const cloud = await remote.list();
        const map = new Map<string, TripDraft>();
        for (const t of await this.local.list()) map.set(t.meta.id, t);
        for (const t of cloud) {
          const existing = map.get(t.meta.id);
          if (!existing || t.meta.updatedAt >= existing.meta.updatedAt) {
            map.set(t.meta.id, t);
            await this.local.save(t);
          }
        }
        return [...map.values()].sort((a, b) =>
          b.meta.updatedAt.localeCompare(a.meta.updatedAt),
        );
      } catch {
        return this.local.list();
      }
    }
    return this.local.list();
  }

  async get(id: string): Promise<TripDraft | null> {
    return (await this.local.get(id)) ?? (await this.remote()?.get(id)) ?? null;
  }

  async save(trip: TripDraft): Promise<TripDraft> {
    const saved = await this.local.save(trip);
    const remote = this.remote();
    if (remote) {
      try {
        await remote.save(saved);
      } catch {
        // Keep local save; surface sync issues via UI separately if needed
      }
    }
    return saved;
  }

  async duplicate(id: string): Promise<TripDraft | null> {
    const copy = await this.local.duplicate(id);
    if (!copy) return null;
    const remote = this.remote();
    if (remote) {
      try {
        await remote.save(copy);
      } catch {
        /* local copy remains */
      }
    }
    return copy;
  }

  async remove(id: string): Promise<void> {
    await this.local.remove(id);
    const remote = this.remote();
    if (remote) {
      try {
        await remote.remove(id);
      } catch {
        /* ignore */
      }
    }
  }

  async createShare(tripId: string, expiresAt?: string | null): Promise<ShareRecord> {
    const remote = this.remote();
    if (remote) {
      try {
        return await remote.createShare(tripId, expiresAt ?? null);
      } catch {
        /* fall through to local share */
      }
    }
    return this.local.createShare(tripId, expiresAt ?? null);
  }

  async revokeShare(token: string): Promise<void> {
    await this.local.revokeShare(token);
    const remote = this.remote();
    if (remote) {
      try {
        await remote.revokeShare(token);
      } catch {
        /* ignore */
      }
    }
  }

  async getByShareToken(token: string): Promise<TripDraft | null> {
    const remote = this.remote();
    if (remote) {
      try {
        const cloud = await remote.getByShareToken(token);
        if (cloud) return cloud;
      } catch {
        /* fall back */
      }
    }
    return this.local.getByShareToken(token);
  }
}

export function getTripRepository(): TripRepository {
  if (typeof window === "undefined") {
    return new LocalTripRepository();
  }
  return new HybridTripRepository();
}

export async function fetchSharedTripServer(
  token: string,
): Promise<TripDraft | null> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_shared_trip", {
    p_token: token,
  });
  if (error || !data) return null;
  const payload = data as { trip?: TripDraft };
  return normalizeTripDraft(payload.trip ?? null);
}
