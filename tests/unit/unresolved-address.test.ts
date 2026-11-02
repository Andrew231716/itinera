import { describe, expect, it } from "vitest";
import {
  applyResolvedGiroAddress,
  isUnmappedPlace,
  suggestEditQuery,
  type GiroUnresolvedAddress,
} from "@/lib/giro/unresolved-address";
import type { GiroStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";

function place(partial: Partial<PlaceRef> & { id: string }): PlaceRef {
  return {
    label: partial.label ?? partial.id,
    location: partial.location ?? { lat: 45.46, lng: 9.19 },
    source: partial.source ?? "manual",
    ...partial,
  };
}

function stop(id: string, loc = { lat: 0, lng: 0 }): GiroStop {
  return {
    id,
    place: place({ id: `p-${id}`, label: `Stop ${id}`, location: loc }),
    arriveBy: null,
    dwellMinutes: 0,
    pauseMinutes: 0,
    positionLock: "auto",
  };
}

describe("unresolved giro addresses", () => {
  it("detects unmapped 0,0 places", () => {
    expect(isUnmappedPlace(place({ id: "a", location: { lat: 0, lng: 0 } }))).toBe(
      true,
    );
    expect(
      isUnmappedPlace(place({ id: "b", location: { lat: 45.5, lng: 9.2 } })),
    ).toBe(false);
  });

  it("patches an existing stop when stopId is set", () => {
    const stops = [stop("s1"), stop("s2")];
    const unresolved: GiroUnresolvedAddress[] = [
      {
        id: "u1",
        query: "Cms Sesto, Milano",
        message: "Nessun risultato",
        stopId: "s1",
      },
    ];
    const fixed = place({
      id: "resolved",
      label: "Via Gorizia, Sesto San Giovanni",
      address: "Via Gorizia, Sesto San Giovanni MI",
      location: { lat: 45.53, lng: 9.23 },
    });
    const result = applyResolvedGiroAddress(stops, unresolved, "u1", fixed);
    expect(result.unresolved).toHaveLength(0);
    expect(result.addPlace).toBeNull();
    expect(result.stops[0].place.location.lat).toBeCloseTo(45.53);
    expect(result.stops[0].place.label).toBe("Stop s1");
    expect(result.stops[0].place.address).toBe(
      "Via Gorizia, Sesto San Giovanni MI",
    );
  });

  it("asks to add a new place when there is no stopId", () => {
    const unresolved: GiroUnresolvedAddress[] = [
      { id: "u2", query: "Piazza Duomo, Milano", message: "fail" },
    ];
    const fixed = place({ id: "duomo", label: "Duomo" });
    const result = applyResolvedGiroAddress([], unresolved, "u2", fixed);
    expect(result.addPlace?.id).toBe("duomo");
    expect(result.unresolved).toHaveLength(0);
  });

  it("suggests a cleaner edit query from hub-style labels", () => {
    expect(
      suggestEditQuery(
        "Cms Sesto-1 Gorizia HUB-CMS-Sesto-Monza, Milano",
      ),
    ).toBe("Sesto-1 Gorizia, Milano");
  });
});
