import { updateSyncState } from "@/lib/storage/sync-state";
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

function readShares(): ShareRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHARE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShareRecord[];
    return Array.isArray(parsed) ? parsed : [];
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

  cache(trip: TripDraft): void {
    writeAll([...readAll().filter((t) => t.meta.id !== trip.meta.id), trip]);
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
    writeShares(readShares().filter((s) => s.tripId !== id));
  }

  async createShare(
    tripId: string,
    expiresAt: string | null = null,
  ): Promise<ShareRecord> {
    const trip = await this.get(tripId);
    if (!trip) throw new Error("Viaggio non trovato.");
    const token =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "");
    const record: ShareRecord = {
      token,
      tripId,
      permission: "read",
      createdAt: new Date().toISOString(),
      expiresAt,
      revokedAt: null,
      urlPath: `/share/${token}`,
    };
    // Persist a snapshot for local share resolution
    localStorage.setItem(
      `itinera.share.snapshot.${token}`,
      JSON.stringify(trip),
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
      return JSON.parse(raw) as TripDraft;
    } catch {
      return null;
    }
  }
}

/**
 * Browser Supabase repository for authenticated users (RLS).
 * Anonymous cloud sync uses /api/trips with optional service role.
 */
let anonymousSession: Promise<void> | null = null;

export class SupabaseTripRepository implements TripRepository {
  constructor(private readonly clientOwnerKey?: string) {}

  private async client() {
    const c = createBrowserSupabaseClient();
    if (!c) {
      throw new Error(
        "Supabase non configurato. Imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    const {
      data: { session },
    } = await c.auth.getSession();
    if (!session) {
      if (!anonymousSession)
        anonymousSession = (async () => {
          const { error } = await c.auth.signInAnonymously();
          if (error)
            throw new Error(
              error.message.includes("Anonymous sign-ins are disabled")
                ? "Accesso ospite al cloud disattivato nella configurazione Supabase. Il viaggio è salvato sul dispositivo."
                : "Accesso cloud non disponibile. Il viaggio resta su questo dispositivo. " +
                    error.message,
            );
        })();
      try {
        await anonymousSession;
      } finally {
        anonymousSession = null;
      }
    }
    return c;
  }

  async list(): Promise<TripDraft[]> {
    const supabase = await this.client();
    const { data, error } = await supabase
      .from("trips")
      .select("trip_data")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (
      (data as { trip_data: TripDraft }[] | null)?.map((r) => r.trip_data) ?? []
    );
  }

  async get(id: string): Promise<TripDraft | null> {
    const supabase = await this.client();
    const { data, error } = await supabase
      .from("trips")
      .select("trip_data")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { trip_data: TripDraft } | null)?.trip_data ?? null;
  }

  async save(trip: TripDraft): Promise<TripDraft> {
    const supabase = await this.client();
    const next = trip;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const row = {
      id: next.meta.id,
      title: next.meta.title,
      trip_data: next,
      owner_id: user?.id ?? null,
      client_owner_key: user
        ? null
        : (this.clientOwnerKey ?? getOrCreateClientOwnerKey()),
      updated_at: next.meta.updatedAt,
    };

    const { data: current, error: readError } = await supabase
      .from("trips")
      .select("trip_data,updated_at")
      .eq("id", next.meta.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (
      current &&
      (current.trip_data as TripDraft).meta.updatedAt > next.meta.updatedAt
    ) {
      throw new Error(
        "Conflitto: esiste una versione cloud più recente. Usa “Conserva entrambe” in Backup e sincronizzazione.",
      );
    }
    if (current) {
      const { data, error } = await supabase
        .from("trips")
        .update(row)
        .eq("id", next.meta.id)
        .eq("updated_at", current.updated_at)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length)
        throw new Error(
          "Il viaggio cloud è cambiato durante il salvataggio. Riprova.",
        );
    } else {
      const { error } = await supabase.from("trips").insert(row);
      if (error) throw new Error(error.message);
    }
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
    const supabase = await this.client();
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async createShare(
    tripId: string,
    expiresAt: string | null = null,
  ): Promise<ShareRecord> {
    const supabase = await this.client();
    const { data, error } = await supabase
      .from("shared_trips")
      .insert({
        trip_id: tripId,
        permission: "read",
        expires_at: expiresAt,
      })
      .select(
        "share_token, trip_id, permission, created_at, expires_at, revoked_at",
      )
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
    const supabase = await this.client();
    const { error } = await supabase
      .from("shared_trips")
      .update({ revoked_at: new Date().toISOString() })
      .eq("share_token", token);
    if (error) throw new Error(error.message);
  }

  async getByShareToken(token: string): Promise<TripDraft | null> {
    const supabase = await this.client();
    const { data, error } = await supabase.rpc("get_shared_trip", {
      p_token: token,
    });
    if (error) throw new Error(error.message);
    if (!data) return null;
    const payload = data as { trip?: TripDraft };
    return payload.trip ?? null;
  }
}

/**
 * Writes to local first, then best-effort sync to Supabase when configured.
 * Local remains source of offline truth.
 */
type PendingChange = { id: string; version: string; trip: TripDraft | null };
const QUEUE_KEY = "itinera.pendingSync.v1";
function readQueue(): PendingChange[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(queue: PendingChange[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  updateSyncState({ pending: queue.length });
}
function enqueue(id: string, trip: TripDraft | null) {
  writeQueue([
    ...readQueue().filter((item) => item.id !== id),
    { id, trip, version: crypto.randomUUID() },
  ]);
}
let flushing: Promise<void> | null = null;

export class HybridTripRepository implements TripRepository {
  private local = new LocalTripRepository();
  private remote(): SupabaseTripRepository | null {
    return isSupabaseConfigured()
      ? new SupabaseTripRepository(getOrCreateClientOwnerKey())
      : null;
  }

  async sync(): Promise<void> {
    if (flushing) return flushing;
    const remote = this.remote();
    const pending = readQueue();
    updateSyncState({ pending: pending.length });
    if (!remote || (typeof navigator !== "undefined" && !navigator.onLine))
      return;
    flushing = (async () => {
      updateSyncState({ running: true, error: null });
      try {
        for (const change of pending) {
          if (change.trip) await remote.save(change.trip);
          else await remote.remove(change.id);
          // A newer local edit must remain queued while an older write finishes.
          writeQueue(
            readQueue().filter((item) => item.version !== change.version),
          );
        }
        updateSyncState({ lastSyncedAt: new Date().toISOString() });
      } catch (error) {
        updateSyncState({
          error:
            error instanceof Error
              ? error.message
              : "Sincronizzazione da riprovare",
        });
      } finally {
        updateSyncState({ running: false });
      }
    })();
    try {
      await flushing;
    } finally {
      flushing = null;
    }
  }

  async list(): Promise<TripDraft[]> {
    await this.sync();
    const remote = this.remote();
    if (remote && (typeof navigator === "undefined" || navigator.onLine)) {
      try {
        const cloud = await remote.list();
        const blocked = new Set(readQueue().map((item) => item.id));
        const map = new Map(
          (await this.local.list()).map((trip) => [trip.meta.id, trip]),
        );
        for (const trip of cloud) {
          if (blocked.has(trip.meta.id)) continue;
          const existing = map.get(trip.meta.id);
          if (!existing || trip.meta.updatedAt > existing.meta.updatedAt) {
            map.set(trip.meta.id, trip);
            this.local.cache(trip);
          }
        }
        return [...map.values()].sort((a, b) =>
          b.meta.updatedAt.localeCompare(a.meta.updatedAt),
        );
      } catch (error) {
        updateSyncState({
          error:
            error instanceof Error ? error.message : "Cloud non raggiungibile",
        });
      }
    }
    return this.local.list();
  }

  async get(id: string): Promise<TripDraft | null> {
    const queued = readQueue().find((item) => item.id === id);
    if (queued) return queued.trip;
    return (await this.local.get(id)) ?? (await this.remote()?.get(id)) ?? null;
  }

  async save(trip: TripDraft): Promise<TripDraft> {
    const saved = await this.local.save(trip);
    if (this.remote()) enqueue(saved.meta.id, saved);
    return saved;
  }

  async duplicate(id: string): Promise<TripDraft | null> {
    const copy = await this.local.duplicate(id);
    return copy ? this.save(copy) : null;
  }

  async remove(id: string): Promise<void> {
    // Queue the tombstone before deleting, so a failed remote delete cannot revive it.
    if (this.remote()) enqueue(id, null);
    await this.local.remove(id);
    await this.sync();
  }

  async createShare(
    tripId: string,
    expiresAt?: string | null,
  ): Promise<ShareRecord> {
    const remote = this.remote();
    if (!remote)
      throw new Error(
        "La condivisione richiede il cloud. Puoi esportare il viaggio dal backup.",
      );
    await this.sync();
    if (readQueue().some((item) => item.id === tripId))
      throw new Error(
        "Il viaggio è salvato qui ma il cloud è in attesa. Riprova la sincronizzazione prima di condividerlo.",
      );
    const record = await remote.createShare(tripId, expiresAt ?? null);
    const response = await fetch(
      record.urlPath.replace("/share/", "/api/share/"),
      { cache: "no-store" },
    );
    if (!response.ok || !(await response.json()).trip) {
      await remote.revokeShare(record.token);
      throw new Error(
        "Il link non è raggiungibile. Nessun link pubblico è stato confermato.",
      );
    }
    return record;
  }

  async revokeShare(token: string): Promise<void> {
    const remote = this.remote();
    if (!remote) throw new Error("Connettiti al cloud per revocare il link.");
    await remote.revokeShare(token);
  }

  async getByShareToken(token: string): Promise<TripDraft | null> {
    return (await this.remote()?.getByShareToken(token)) ?? null;
  }
}

export async function preserveSyncConflicts(): Promise<Map<string, TripDraft>> {
  if (flushing) await flushing;
  const remote = new SupabaseTripRepository(getOrCreateClientOwnerKey());
  const local = new LocalTripRepository();
  const copies = new Map<string, TripDraft>();
  for (const change of readQueue()) {
    if (!change.trip) continue;
    const cloud = await remote.get(change.id);
    if (!cloud || cloud.meta.updatedAt <= change.trip.meta.updatedAt) continue;
    const now = new Date().toISOString();
    const copy: TripDraft = {
      ...structuredClone(change.trip),
      meta: {
        ...change.trip.meta,
        id: crypto.randomUUID(),
        title: `${change.trip.meta.title} (copia locale)`,
        createdAt: now,
        updatedAt: now,
      },
    };
    local.cache(copy);
    enqueue(copy.meta.id, copy);
    // Replace the colliding local record only after its copy is durable.
    local.cache(cloud);
    writeQueue(readQueue().filter((item) => item.version !== change.version));
    copies.set(change.id, copy);
  }
  await syncPendingTrips();
  return copies;
}

export async function syncPendingTrips(): Promise<void> {
  await new HybridTripRepository().sync();
}

export function getTripRepository(): TripRepository {
  if (typeof window === "undefined") {
    return new LocalTripRepository();
  }
  return new HybridTripRepository();
}

/** Server-side share lookup via RPC (no service role required). */
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
  return payload.trip ?? null;
}
