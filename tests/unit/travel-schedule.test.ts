import { describe, expect, it } from "vitest";
import {
  applyOptimizedIntermediateOrder,
  buildArrivalSchedule,
  orderPlacesByNearestNeighbor,
} from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";
import type { RouteLeg } from "@/lib/types/route";

function place(id: string, lat: number, lng: number): PlaceRef {
  return {
    id,
    label: id,
    location: { lat, lng },
    source: "manual",
  };
}

describe("orderPlacesByNearestNeighbor", () => {
  it("visits nearest places first from origin", () => {
    const origin = place("O", 45.0, 9.0);
    const a = place("A", 45.01, 9.0); // ~1.1 km
    const b = place("B", 45.1, 9.0); // ~11 km
    const c = place("C", 45.02, 9.0); // ~2.2 km
    const ordered = orderPlacesByNearestNeighbor(origin, [b, c, a]);
    expect(ordered.map((p) => p.id)).toEqual(["A", "C", "B"]);
  });
});

describe("applyOptimizedIntermediateOrder", () => {
  it("reorders by index list", () => {
    const places = [place("a", 1, 1), place("b", 2, 2), place("c", 3, 3)];
    expect(
      applyOptimizedIntermediateOrder(places, [2, 0, 1]).map((p) => p.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("keeps original when order length mismatches", () => {
    const places = [place("a", 1, 1), place("b", 2, 2)];
    expect(applyOptimizedIntermediateOrder(places, [1])).toEqual(places);
  });
});

describe("buildArrivalSchedule", () => {
  it("accumulates leg durations from departure", () => {
    const origin = place("O", 0, 0);
    const stops = [place("S1", 1, 1), place("D", 2, 2)];
    const legs: RouteLeg[] = [
      {
        id: "l0",
        startLabel: "O",
        endLabel: "S1",
        distanceMeters: 1000,
        durationSeconds: 600,
        steps: [],
      },
      {
        id: "l1",
        startLabel: "S1",
        endLabel: "D",
        distanceMeters: 2000,
        durationSeconds: 1200,
        steps: [],
      },
    ];
    const departureAt = "2026-10-27T08:00:00.000Z";
    const rows = buildArrivalSchedule({
      departureAt,
      origin,
      orderedPlaces: stops,
      legs,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0].kind).toBe("origin");
    expect(rows[0].arrivalAt).toBe(departureAt);
    expect(rows[1].kind).toBe("stop");
    expect(rows[1].arrivalAt).toBe("2026-10-27T08:10:00.000Z");
    expect(rows[2].kind).toBe("destination");
    expect(rows[2].arrivalAt).toBe("2026-10-27T08:30:00.000Z");
    expect(rows[2].cumulativeSeconds).toBe(1800);
  });
});
