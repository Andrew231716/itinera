import { describe, expect, it } from "vitest";
import {
  applyGiroWindowOrder,
  applyOptimizedIntermediateOrder,
  assignGiroPositionLock,
  buildArrivalSchedule,
  findGiroFlexibleWindows,
  formatLegTravelLabel,
  giroHasHardLocks,
  orderGiroStops,
  orderPlacesByNearestNeighbor,
  type GiroStop,
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

function giro(
  id: string,
  lat: number,
  lng: number,
  lock: GiroStop["positionLock"] = "auto",
  arriveBy: string | null = null,
): GiroStop {
  return {
    id,
    place: place(id, lat, lng),
    arriveBy,
    dwellMinutes: 0,
    pauseMinutes: 0,
    positionLock: lock,
  };
}

describe("orderPlacesByNearestNeighbor", () => {
  it("visits nearest places first from origin", () => {
    const origin = place("O", 45.0, 9.0);
    const a = place("A", 45.01, 9.0);
    const b = place("B", 45.1, 9.0);
    const c = place("C", 45.02, 9.0);
    const ordered = orderPlacesByNearestNeighbor(origin, [b, c, a]);
    expect(ordered.map((p) => p.id)).toEqual(["A", "C", "B"]);
  });
});

describe("orderGiroStops", () => {
  it("keeps a stop locked as last", () => {
    const origin = place("O", 45.0, 9.0);
    const near = giro("near", 45.01, 9.0);
    const far = giro("far", 45.2, 9.0, "last");
    const mid = giro("mid", 45.05, 9.0);
    const { ordered } = orderGiroStops(origin, [far, near, mid]);
    expect(ordered.map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("honors a fixed 2nd position", () => {
    const origin = place("O", 45.0, 9.0);
    const a = giro("a", 45.01, 9.0);
    const locked = giro("locked", 45.3, 9.0, 2);
    const c = giro("c", 45.02, 9.0);
    const { ordered } = orderGiroStops(origin, [a, locked, c]);
    expect(ordered[1].id).toBe("locked");
    expect(ordered).toHaveLength(3);
  });

  it("detects hard locks", () => {
    expect(giroHasHardLocks([giro("a", 1, 1)])).toBe(false);
    expect(giroHasHardLocks([giro("a", 1, 1, "last")])).toBe(true);
    expect(giroHasHardLocks([giro("a", 1, 1, 9)])).toBe(true);
  });
});

describe("assignGiroPositionLock", () => {
  it("inserts at a taken number and shifts the rest forward", () => {
    const a = giro("a", 45.01, 9.0, 1);
    const b = giro("b", 45.02, 9.0, 2);
    const c = giro("c", 45.03, 9.0, 3);
    const d = giro("d", 45.04, 9.0);
    const next = assignGiroPositionLock([a, b, c, d], "d", 2);
    const byId = Object.fromEntries(next.map((s) => [s.id, s.positionLock]));
    expect(byId.a).toBe(1);
    expect(byId.d).toBe(2);
    expect(byId.b).toBe(3);
    expect(byId.c).toBe(4);
    expect(next.map((s) => s.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("keeps orderGiroStops aligned after a shifted insert", () => {
    const origin = place("O", 45.0, 9.0);
    const a = giro("a", 45.01, 9.0, 1);
    const b = giro("b", 45.02, 9.0, 2);
    const c = giro("c", 45.03, 9.0, 3);
    const d = giro("d", 45.04, 9.0);
    const locked = assignGiroPositionLock([a, b, c, d], "d", 2);
    const { ordered } = orderGiroStops(origin, locked);
    expect(ordered.map((s) => s.id)).toEqual(["a", "d", "b", "c"]);
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
  it("accumulates leg durations and compares arriveBy", () => {
    const origin = place("O", 0, 0);
    const stops = [place("S1", 1, 1), place("D", 2, 2)];
    const giroStops = [
      giro("S1", 1, 1, "auto", "2026-10-27T08:05:00.000Z"),
      giro("D", 2, 2),
    ];
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
      orderedGiroStops: giroStops,
    });
    expect(rows).toHaveLength(3);
    expect(rows[1].arrivalAt).toBe("2026-10-27T08:10:00.000Z");
    expect(rows[1].arriveBy).toBe("2026-10-27T08:05:00.000Z");
    expect(rows[1].vsArriveBySeconds).toBe(300);
    expect(rows[1].legFromPreviousSeconds).toBe(600);
    expect(rows[1].legFromPreviousMeters).toBe(1000);
    expect(rows[1].legEstimated).toBe(false);
    expect(formatLegTravelLabel(rows[1])).toMatch(/min/);
    expect(rows[2].arrivalAt).toBe("2026-10-27T08:30:00.000Z");
  });

  it("adds dwell time before the next leg", () => {
    const origin = place("O", 0, 0);
    const s1 = place("S1", 1, 1);
    const d = place("D", 2, 2);
    const giroStops = [
      { ...giro("S1", 1, 1), dwellMinutes: 10 },
      { ...giro("D", 2, 2), dwellMinutes: 0 },
    ];
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
        durationSeconds: 600,
        steps: [],
      },
    ];
    const rows = buildArrivalSchedule({
      departureAt: "2026-10-27T08:00:00.000Z",
      origin,
      orderedPlaces: [s1, d],
      legs,
      orderedGiroStops: giroStops,
    });
    // Arrive S1 08:10, dwell 10 → leave 08:20, +10 min leg → D 08:30
    expect(rows[1].arrivalAt).toBe("2026-10-27T08:10:00.000Z");
    expect(rows[1].departAt).toBe("2026-10-27T08:20:00.000Z");
    expect(rows[1].dwellMinutes).toBe(10);
    expect(rows[1].pauseMinutes).toBe(0);
    expect(rows[2].arrivalAt).toBe("2026-10-27T08:30:00.000Z");
  });

  it("auto-pauses so the next stop with arriveBy is on time", () => {
    const origin = place("O", 0, 0);
    const s1 = place("S1", 1, 1);
    const d = place("D", 2, 2);
    // Arrive S1 08:10, dwell 5 → ready 08:15. Next leg 10 min.
    // D appointment 08:40 → ideal leave 08:30 → pause 15 min → arrive D 08:40.
    const giroStops = [
      { ...giro("S1", 1, 1), dwellMinutes: 5 },
      {
        ...giro("D", 2, 2, "auto", "2026-10-27T08:40:00.000Z"),
        dwellMinutes: 0,
      },
    ];
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
        durationSeconds: 600,
        steps: [],
      },
    ];
    const rows = buildArrivalSchedule({
      departureAt: "2026-10-27T08:00:00.000Z",
      origin,
      orderedPlaces: [s1, d],
      legs,
      orderedGiroStops: giroStops,
    });
    expect(rows[1].arrivalAt).toBe("2026-10-27T08:10:00.000Z");
    expect(rows[1].pauseMinutes).toBe(15);
    expect(rows[1].departAt).toBe("2026-10-27T08:30:00.000Z");
    expect(rows[2].arrivalAt).toBe("2026-10-27T08:40:00.000Z");
    expect(rows[2].vsArriveBySeconds).toBe(0);
  });

  it("pauses at origin when the first stop has arriveBy", () => {
    const origin = place("O", 0, 0);
    const dest = place("D", 1, 1);
    // Leave ready at 08:00, leg 10 min. Appointment 08:25 → pause 15 at origin.
    const giroStops = [
      giro("D", 1, 1, "auto", "2026-10-27T08:25:00.000Z"),
    ];
    const legs: RouteLeg[] = [
      {
        id: "l0",
        startLabel: "O",
        endLabel: "D",
        distanceMeters: 1000,
        durationSeconds: 600,
        steps: [],
      },
    ];
    const rows = buildArrivalSchedule({
      departureAt: "2026-10-27T08:00:00.000Z",
      origin,
      orderedPlaces: [dest],
      legs,
      orderedGiroStops: giroStops,
    });
    expect(rows[0].pauseMinutes).toBe(15);
    expect(rows[0].departAt).toBe("2026-10-27T08:15:00.000Z");
    expect(rows[1].arrivalAt).toBe("2026-10-27T08:25:00.000Z");
    expect(rows[1].vsArriveBySeconds).toBe(0);
  });

  it("does not pause when already late for the next appointment", () => {
    const origin = place("O", 0, 0);
    const s1 = place("S1", 1, 1);
    const d = place("D", 2, 2);
    // Arrive S1 08:10, dwell 0. Next leg 20 min. Appointment D 08:20 → need leave 08:00, already late.
    const giroStops = [
      giro("S1", 1, 1),
      giro("D", 2, 2, "auto", "2026-10-27T08:20:00.000Z"),
    ];
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
    const rows = buildArrivalSchedule({
      departureAt: "2026-10-27T08:00:00.000Z",
      origin,
      orderedPlaces: [s1, d],
      legs,
      orderedGiroStops: giroStops,
    });
    expect(rows[1].pauseMinutes).toBe(0);
    expect(rows[1].departAt).toBe("2026-10-27T08:10:00.000Z");
    expect(rows[2].vsArriveBySeconds).toBeGreaterThan(0);
  });

  it("estimates legs when the router returns none", () => {
    const origin = place("O", 45.0, 9.0);
    const dest = place("D", 45.1, 9.0);
    const rows = buildArrivalSchedule({
      departureAt: "2026-10-27T08:00:00.000Z",
      origin,
      orderedPlaces: [dest],
      legs: [],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].legFromPreviousSeconds).toBeGreaterThan(0);
    expect(rows[1].legFromPreviousMeters).toBeGreaterThan(0);
    expect(rows[1].legEstimated).toBe(true);
    expect(formatLegTravelLabel(rows[1])).toMatch(/stima/);
  });
});

describe("findGiroFlexibleWindows", () => {
  it("suggests reorder alternatives between fixed anchors", () => {
    const origin = place("O", 45.0, 9.0);
    const first = giro("first", 45.01, 9.0, 1);
    const a = giro("a", 45.02, 9.0);
    const b = giro("b", 45.03, 9.0);
    const last = giro("last", 45.2, 9.0, "last");
    const ordered = [first, a, b, last];
    const windows = findGiroFlexibleWindows(origin, ordered);
    expect(windows).toHaveLength(1);
    expect(windows[0].beforeLabel).toBe("first");
    expect(windows[0].afterLabel).toBe("last");
    expect(windows[0].currentOrderIds).toEqual(["a", "b"]);
    expect(windows[0].alternatives.length).toBeGreaterThan(0);
    expect(windows[0].alternatives[0].orderIds).toEqual(["b", "a"]);
  });

  it("applies a chosen window order", () => {
    const ordered = [
      giro("first", 45.01, 9.0, 1),
      giro("a", 45.02, 9.0),
      giro("b", 45.03, 9.0),
      giro("last", 45.2, 9.0, "last"),
    ];
    const next = applyGiroWindowOrder(
      ordered,
      { start: 1, end: 2 },
      ["b", "a"],
    );
    expect(next.map((s) => s.id)).toEqual(["first", "b", "a", "last"]);
  });

  it("returns nothing when free stops cannot be swapped", () => {
    const origin = place("O", 45.0, 9.0);
    const only = giro("only", 45.02, 9.0);
    expect(findGiroFlexibleWindows(origin, [only])).toEqual([]);
  });
});
