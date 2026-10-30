import { describe, expect, it } from "vitest";
import {
  pushRemovedGiroStop,
  restoreGiroStop,
  takeRemovedGiroStop,
} from "@/lib/giro/removed-stops";
import type { GiroStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";

function place(id: string, lat = 45, lng = 9): PlaceRef {
  return { id, label: id, location: { lat, lng }, source: "manual" };
}

function stop(
  id: string,
  opts?: Partial<GiroStop> & { lat?: number; lng?: number },
): GiroStop {
  return {
    id,
    place: place(id, opts?.lat ?? 45, opts?.lng ?? 9),
    arriveBy: opts?.arriveBy ?? "2026-10-30T10:00:00.000Z",
    dwellMinutes: opts?.dwellMinutes ?? 12,
    pauseMinutes: opts?.pauseMinutes ?? 5,
    positionLock: opts?.positionLock ?? 3,
  };
}

describe("removed giro stops", () => {
  it("keeps newest first and caps the list", () => {
    let list = pushRemovedGiroStop([], stop("a"), new Date("2026-10-30T08:00:00Z"), 2);
    list = pushRemovedGiroStop(list, stop("b"), new Date("2026-10-30T08:01:00Z"), 2);
    list = pushRemovedGiroStop(list, stop("c"), new Date("2026-10-30T08:02:00Z"), 2);
    expect(list.map((e) => e.stop.id)).toEqual(["c", "b"]);
  });

  it("restores the full stop snapshot", () => {
    const removed = pushRemovedGiroStop(
      [],
      stop("x", {
        arriveBy: "2026-10-30T11:30:00.000Z",
        dwellMinutes: 20,
        pauseMinutes: 8,
        positionLock: "last",
        lat: 45.1,
        lng: 9.2,
      }),
    );
    const result = restoreGiroStop([], removed, "x");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].arriveBy).toBe("2026-10-30T11:30:00.000Z");
    expect(result.stops[0].dwellMinutes).toBe(20);
    expect(result.stops[0].pauseMinutes).toBe(8);
    expect(result.stops[0].positionLock).toBe("last");
    expect(result.removed).toHaveLength(0);
  });

  it("blocks restore when the place is already in the tour", () => {
    const s = stop("a", { lat: 45.5, lng: 9.5 });
    const removed = pushRemovedGiroStop([], s);
    const result = restoreGiroStop([s], removed, "a");
    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("takeRemovedGiroStop returns null for unknown id", () => {
    expect(takeRemovedGiroStop([], "nope")).toBeNull();
  });
});
