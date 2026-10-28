import { describe, expect, it } from "vitest";
import { tripDraftToGiroSeed } from "@/lib/giro/trip-to-giro";
import type { PlaceRef, TripDraft } from "@/lib/types/trip";

function place(label: string, lat: number, lng: number): PlaceRef {
  return {
    id: `id-${label}`,
    label,
    placeId: `pid-${label}`,
    location: { lat, lng },
    source: "manual",
  };
}

function baseTrip(partial: Partial<TripDraft> = {}): TripDraft {
  return {
    origin: place("A", 45, 9),
    destination: place("C", 45.2, 9.2),
    stops: [
      {
        id: "s1",
        place: place("B", 45.1, 9.1),
      },
    ],
    departureAt: "2026-10-28T08:00:00.000Z",
    travelMode: "DRIVE",
    preferences: {
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: false,
      avoidTunnels: false,
      preferFastest: true,
      preferShortest: false,
      preferScenic: false,
      maxExtraMinutes: null,
    },
    exclusions: [],
    optimizeStopOrder: false,
    selectedRouteId: null,
    meta: {
      id: "t1",
      title: "Milano giro",
      createdAt: "2026-10-28T07:00:00.000Z",
      updatedAt: "2026-10-28T07:00:00.000Z",
    },
    ...partial,
  };
}

describe("tripDraftToGiroSeed", () => {
  it("puts intermediate stops then destination locked last", () => {
    const seed = tripDraftToGiroSeed(baseTrip());
    expect(seed.title).toBe("Milano giro");
    expect(seed.origin?.label).toBe("A");
    expect(seed.departureAt).toBe("2026-10-28T08:00:00.000Z");
    expect(seed.stops.map((s) => s.place.label)).toEqual(["B", "C"]);
    expect(seed.stops[0].positionLock).toBe("auto");
    expect(seed.stops[1].positionLock).toBe("last");
  });

  it("works with only origin and destination", () => {
    const seed = tripDraftToGiroSeed(baseTrip({ stops: [] }));
    expect(seed.stops).toHaveLength(1);
    expect(seed.stops[0].place.label).toBe("C");
    expect(seed.stops[0].positionLock).toBe("last");
  });

  it("keeps origin without destination", () => {
    const seed = tripDraftToGiroSeed(
      baseTrip({ destination: null, stops: [] }),
    );
    expect(seed.origin?.label).toBe("A");
    expect(seed.stops).toHaveLength(0);
  });
});
