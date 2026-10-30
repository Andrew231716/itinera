import type { GiroStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef, TripDraft } from "@/lib/types/trip";

export type GiroSeed = {
  title: string;
  origin: PlaceRef | null;
  departureAt: string | null;
  stops: GiroStop[];
};

/**
 * Map a saved/history trip into the Giro editor: intermediate stops +
 * destination as the last visit (locked last).
 */
export function tripDraftToGiroSeed(trip: TripDraft): GiroSeed {
  const stops: GiroStop[] = [];

  for (const stop of trip.stops) {
    stops.push({
      id: stop.id || crypto.randomUUID(),
      place: stop.place,
      arriveBy: null,
      dwellMinutes: Math.max(0, Math.round(stop.dwellMinutes ?? 10)),
      pauseMinutes: 0,
      positionLock: "auto",
    });
  }

  if (trip.destination) {
    stops.push({
      id: crypto.randomUUID(),
      place: trip.destination,
      arriveBy: null,
      dwellMinutes: Math.max(0, Math.round(0)),
      pauseMinutes: 0,
      positionLock: "last",
    });
  }

  return {
    title: trip.meta.title?.trim() || "Giro da cronologia",
    origin: trip.origin,
    departureAt: trip.departureAt,
    stops,
  };
}
