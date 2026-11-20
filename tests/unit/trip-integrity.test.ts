/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { useTripStore } from '@/lib/store/trip-store';
import { createEmptyTrip, type PlaceRef } from '@/lib/types/trip';
import type { ComputedRoute } from '@/lib/types/route';
import { travelPlan } from '@/lib/routing/planning';
const place = (id: string): PlaceRef => ({ id, label: id, location: { lat: 45, lng: Number(id) || 9 }, source: 'manual' });
const route: ComputedRoute = { id: 'r', label: 'Percorso', distanceMeters: 100_000, durationSeconds: 3600, polyline: '', decodedPath: [{ lat: 45, lng: 9 }, { lat: 46, lng: 9 }], legs: [], warnings: [], violations: [], engine: 'google_routes', tolls: { hasTolls: true, estimatedPrice: 5, currencyCode: 'EUR' } };
function ready() {
  const store = useTripStore.getState(); store.setOrigin(place('1')); store.setDestination(place('2')); store.setRoutesResult({ routes: [route], limitations: [], mode: 'live' });
}
describe('trip edits and route integrity', () => {
  beforeEach(() => { localStorage.clear(); useTripStore.getState().loadTrip(createEmptyTrip()); });
  it.each(['origin','destination','departure','resetRules','exclusions','optimization'])('invalidates stale routes after %s', field => {
    ready();
    const store = useTripStore.getState();
    if (field === 'origin') store.setOrigin(place('3'));
    if (field === 'destination') store.setDestination(place('3'));
    if (field === 'departure') store.setDepartureAt('2027-08-01T08:00:00Z');
    if (field === 'resetRules') { store.setPreferences({ avoidTolls: true }); useTripStore.getState().setRoutesResult({ routes: [route], limitations: [], mode: 'live' }); store.resetPreferences(); }
    if (field === 'exclusions') store.addExclusion({ id: 'x', kind: 'geo_zone', label: 'Zona', strength: 'hard', createdAt: new Date().toISOString(), polygon: [{lat:45,lng:9},{lat:46,lng:9},{lat:46,lng:10}] });
    if (field === 'optimization') store.setOptimizeStopOrder(true);
    expect(useTripStore.getState().routes).toHaveLength(0);
    expect(useTripStore.getState().routeNeedsUpdate).toBe(true);
  });
  it('undo restores stops and preserves title-only route validity', () => {
    ready(); const store = useTripStore.getState(); store.addStop(place('3')); store.removeStop(useTripStore.getState().trip.stops[0].id); store.undoTripChange();
    expect(useTripStore.getState().trip.stops).toHaveLength(1);
    store.setRoutesResult({ routes: [route], limitations: [], mode: 'live' }); store.setTitle('Nuovo titolo');
    expect(useTripStore.getState().routes).toHaveLength(1); store.undoTripChange();
    expect(useTripStore.getState().routes).toHaveLength(1);
  });
  it('loads offline routes intact and starts them', () => {
    const trip = createEmptyTrip(); trip.origin = place('1'); trip.destination = place('2');
    useTripStore.getState().loadOfflinePack({ trip, routes: [route], selectedRouteId: 'r' });
    expect(useTripStore.getState().routes).toHaveLength(1);
    useTripStore.getState().startNavigation(); expect(useTripStore.getState().navigation.status).toBe('starting');
    useTripStore.getState().setDestination(place('3')); expect(useTripStore.getState().navigation.status).toBe('idle');
  });
  it('includes stop duration and actual currency in cost and arrival estimates', () => {
    const trip = createEmptyTrip(); trip.arrivalBy = '2027-08-01T12:00:00Z'; trip.stops = [{ id: 's', place: place('3'), dwellMinutes: 30 }]; trip.costs = { consumptionLitersPer100Km: 6, fuelPricePerLiter: 2 };
    const plan = travelPlan(trip, route); expect(plan.total).toBe(17); expect(plan.departure).toBe('2027-08-01T10:30:00.000Z');
    expect(travelPlan(trip, { ...route, tolls: { hasTolls: true, estimatedPrice: 5, currencyCode: 'CHF' } }).total).toBeNull();
    trip.travelMode = 'WALK'; expect(travelPlan(trip, route).fuel).toBeNull();
  });
});
