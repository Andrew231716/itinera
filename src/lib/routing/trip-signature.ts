import type { TripDraft } from "@/lib/types/trip";

/** Only inputs that can change the computed road geometry or timing. */
export function routingSignature(trip: TripDraft): string {
  return JSON.stringify({
    origin: trip.origin
      ? { location: trip.origin.location, placeId: trip.origin.placeId }
      : null,
    destination: trip.destination
      ? {
          location: trip.destination.location,
          placeId: trip.destination.placeId,
        }
      : null,
    stops: trip.stops.map((s) => ({
      location: s.place.location,
      placeId: s.place.placeId,
      dwellMinutes: s.dwellMinutes ?? 0,
    })),
    departureAt: trip.departureAt,
    travelMode: trip.travelMode,
    preferences: trip.preferences,
    exclusions: trip.exclusions,
    optimizeStopOrder: trip.optimizeStopOrder,
  });
}
