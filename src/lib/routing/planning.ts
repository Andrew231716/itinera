import { distancePointToSegmentMeters } from "@/lib/utils/geometry";
import type { TripDraft } from "@/lib/types/trip";
import type { ComputedRoute } from "@/lib/types/route";
export function tollEstimate(
  route: ComputedRoute,
): { amount: number; currency: string } | null {
  if (route.tolls?.estimatedPrice != null)
    return {
      amount: route.tolls.estimatedPrice,
      currency: route.tolls.currencyCode ?? "EUR",
    };
  if (route.tolls?.michelin?.estimatedPrice != null)
    return {
      amount: route.tolls.michelin.estimatedPrice,
      currency: route.tolls.michelin.currencyCode ?? "EUR",
    };
  if (route.tolls && !route.tolls.hasTolls)
    return { amount: 0, currency: "EUR" };
  return null;
}
export function travelPlan(trip: TripDraft, route: ComputedRoute) {
  const stopsSeconds = trip.stops.reduce(
    (sum, stop) => sum + (stop.dwellMinutes ?? 0) * 60,
    0,
  );
  const durationSeconds = route.durationSeconds + stopsSeconds;
  const arrival = trip.arrivalBy ? Date.parse(trip.arrivalBy) : NaN;
  const departure = Number.isFinite(arrival)
    ? new Date(arrival - durationSeconds * 1000).toISOString()
    : null;
  const fuel =
    (trip.travelMode === "DRIVE" || trip.travelMode === "TWO_WHEELER") &&
    trip.costs &&
    trip.costs.consumptionLitersPer100Km > 0 &&
    trip.costs.fuelPricePerLiter > 0
      ? (route.distanceMeters / 1000 / 100) *
        trip.costs.consumptionLitersPer100Km *
        trip.costs.fuelPricePerLiter
      : null;
  const tolls = tollEstimate(route);
  return {
    stopsSeconds,
    durationSeconds,
    departure,
    fuel,
    tolls,
    total:
      fuel !== null && tolls?.currency === "EUR" ? fuel + tolls.amount : null,
  };
}

/** Geometric proximity only; it does not estimate extra road distance. */
export function distanceToRouteMeters(
  point: import("@/lib/types/trip").LatLng,
  path: import("@/lib/types/trip").LatLng[],
): number {
  let best = Infinity;
  for (let index = 1; index < path.length; index++) {
    best = Math.min(
      best,
      distancePointToSegmentMeters(point, path[index - 1], path[index]),
    );
  }
  return best;
}
