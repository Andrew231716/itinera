import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSavedGiri,
  listSavedGiri,
  removeSavedGiro,
  saveGiro,
  suggestGiroTitle,
} from "@/lib/storage/saved-giri";
import type { GiroStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";
import { DEFAULT_ROAD_PREFERENCES } from "@/lib/types/trip";

function place(label: string, lat: number, lng: number): PlaceRef {
  return {
    id: `p-${label}`,
    label,
    location: { lat, lng },
    source: "manual",
  };
}

function stop(label: string, lat: number, lng: number): GiroStop {
  return {
    id: `s-${label}`,
    place: place(label, lat, lng),
    arriveBy: "2026-10-28T10:00:00.000Z",
    dwellMinutes: 8,
    positionLock: "last",
  };
}

function installLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  // @ts-expect-error test polyfill
  globalThis.window = { localStorage: ls };
  // @ts-expect-error test polyfill
  globalThis.localStorage = ls;
}

describe("saved giri", () => {
  beforeEach(() => {
    installLocalStorage();
    clearSavedGiri();
  });

  it("suggests a readable title", () => {
    expect(
      suggestGiroTitle({
        origin: place("Milano", 45, 9),
        stops: [stop("Roma", 41, 12)],
      }),
    ).toBe("Milano → Roma");
  });

  it("saves times, locks, preferences and schedule", () => {
    const first = saveGiro({
      title: "Giro clienti",
      origin: place("Base", 45, 9),
      departureAt: "2026-10-28T08:00:00.000Z",
      stops: [stop("Cliente A", 45.1, 9.1), stop("Cliente B", 45.2, 9.2)],
      preferences: { ...DEFAULT_ROAD_PREFERENCES, avoidTolls: true },
      travelMode: "DRIVE",
      schedule: [
        {
          kind: "origin",
          place: place("Base", 45, 9),
          arrivalAt: "2026-10-28T08:00:00.000Z",
          departAt: "2026-10-28T08:00:00.000Z",
          dwellMinutes: 0,
          legFromPreviousSeconds: 0,
          legFromPreviousMeters: 0,
          cumulativeSeconds: 0,
        },
      ],
    });
    const listed = listSavedGiri()[0];
    expect(listed.stops[0].positionLock).toBe("last");
    expect(listed.stops[0].arriveBy).toBe("2026-10-28T10:00:00.000Z");
    expect(listed.preferences.avoidTolls).toBe(true);
    expect(listed.travelMode).toBe("DRIVE");
    expect(listed.schedule).toHaveLength(1);

    const updated = saveGiro({
      id: first.id,
      title: "Giro clienti Nord",
      origin: first.origin,
      departureAt: first.departureAt,
      stops: first.stops,
      preferences: first.preferences,
      travelMode: first.travelMode,
      schedule: first.schedule,
    });
    expect(updated.id).toBe(first.id);
    expect(listSavedGiri()).toHaveLength(1);
    expect(listSavedGiri()[0].title).toBe("Giro clienti Nord");

    removeSavedGiro(first.id);
    expect(listSavedGiri()).toHaveLength(0);
  });
});
