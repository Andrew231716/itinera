/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/storage/supabase-client', () => ({ isSupabaseConfigured: () => true, getOrCreateClientOwnerKey: () => 'owner', createBrowserSupabaseClient: () => null, createServerSupabaseClient: () => null }));
import { HybridTripRepository, SupabaseTripRepository, preserveSyncConflicts } from '@/lib/storage/trip-repository';
import { createEmptyTrip } from '@/lib/types/trip';
describe('durable sync queue', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });
  it('retries failed saves and retains newer edits made during a request', async () => {
    const repo = new HybridTripRepository(); const trip = createEmptyTrip();
    vi.spyOn(SupabaseTripRepository.prototype, 'save').mockRejectedValueOnce(new Error('Network'));
    await repo.save(trip); await repo.sync();
    expect(JSON.parse(localStorage.getItem('itinera.pendingSync.v1')!)).toHaveLength(1);
    let finish!: () => void;
    vi.spyOn(SupabaseTripRepository.prototype, 'save').mockImplementation(async trip => { await new Promise<void>(resolve => { finish = resolve; }); return trip; });
    const pending = repo.sync();
    await Promise.resolve();
    await repo.save({ ...trip, meta: { ...trip.meta, title: 'New edit' } });
    finish(); await pending;
    expect(JSON.parse(localStorage.getItem('itinera.pendingSync.v1')!)[0].trip.meta.title).toBe('New edit');
  });
  it('does not revive a deletion when remote delete fails', async () => {
    const repo = new HybridTripRepository(); const trip = createEmptyTrip();
    await repo.save(trip);
    vi.spyOn(SupabaseTripRepository.prototype, 'remove').mockRejectedValue(new Error('Network'));
    vi.spyOn(SupabaseTripRepository.prototype, 'list').mockResolvedValue([trip]);
    await repo.remove(trip.meta.id);
    expect(await repo.list()).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('itinera.pendingSync.v1')!)[0].trip).toBeNull();
  });
  it('does not manufacture a public local-only link after failed sync', async () => {
    const repo = new HybridTripRepository(); const trip = createEmptyTrip();
    vi.spyOn(SupabaseTripRepository.prototype, 'save').mockRejectedValue(new Error('Network'));
    await repo.save(trip);
    await expect(repo.createShare(trip.meta.id)).rejects.toThrow('cloud è in attesa');
    expect(localStorage.getItem('itinera.shares.v1')).toBeNull();
  });
  it('preserves both versions of a conflict under different ids', async () => {
    const repo = new HybridTripRepository(); const trip = createEmptyTrip('Local'); const cloud = structuredClone(trip);
    cloud.meta.title = 'Cloud'; cloud.meta.updatedAt = '2099-01-01T00:00:00Z';
    await repo.save(trip);
    vi.spyOn(SupabaseTripRepository.prototype, 'get').mockResolvedValue(cloud);
    vi.spyOn(SupabaseTripRepository.prototype, 'save').mockImplementation(async trip => trip);
    const copies = await preserveSyncConflicts();
    expect(copies.get(trip.meta.id)?.meta.id).not.toBe(trip.meta.id);
    const records = JSON.parse(localStorage.getItem('itinera.trips.v1')!);
    expect(records.map((item: typeof trip) => item.meta.title)).toEqual(expect.arrayContaining(['Cloud','Local (copia locale)']));
  });
});
