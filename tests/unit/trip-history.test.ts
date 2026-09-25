import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTripHistory,
  listTripHistory,
  recordTripHistory,
  removeTripHistoryEntry,
  tripHistoryFingerprint,
} from "@/lib/storage/trip-history";
import { createEmptyTrip, type PlaceRef } from "@/lib/types/trip";
import { formatRelativeIt } from "@/lib/utils/format";

function place(label: string, lat: number, lng: number): PlaceRef {
  return {
    id: `p-${label}`,
    label,
    location: { lat, lng },
    source: "manual",
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

describe("trip history", () => {
  beforeEach(() => {
    installLocalStorage();
    clearTripHistory();
  });

  it("records a computed trip and lists newest first", () => {
    const trip = createEmptyTrip("Test");
    trip.origin = place("Milano", 45.46, 9.18);
    trip.destination = place("Roma", 41.89, 12.49);

    recordTripHistory({
      trip,
      routeSummary: {
        distanceMeters: 573_000,
        durationSeconds: 20_000,
        mode: "live",
        tollEstimate: 45.6,
        tollCurrency: "EUR",
      },
    });

    const list = listTripHistory();
    expect(list).toHaveLength(1);
    expect(list[0].trip.origin?.label).toBe("Milano");
    expect(list[0].routeSummary?.tollEstimate).toBe(45.6);
  });

  it("dedupes by fingerprint and bumps the entry to top", () => {
    const trip = createEmptyTrip("A");
    trip.origin = place("Milano", 45.46, 9.18);
    trip.destination = place("Roma", 41.89, 12.49);

    const first = recordTripHistory({
      trip,
      routeSummary: { mode: "live", distanceMeters: 500_000 },
    });

    const other = createEmptyTrip("B");
    other.origin = place("Torino", 45.07, 7.68);
    other.destination = place("Genova", 44.4, 8.93);
    recordTripHistory({
      trip: other,
      routeSummary: { mode: "live", distanceMeters: 170_000 },
    });

    const again = recordTripHistory({
      trip,
      routeSummary: { mode: "live", distanceMeters: 575_000, tollEstimate: 40 },
    });

    expect(again.id).toBe(first.id);
    const list = listTripHistory();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(first.id);
    expect(list[0].routeSummary?.distanceMeters).toBe(575_000);
  });

  it("builds distinct fingerprints for different destinations", () => {
    const a = createEmptyTrip();
    a.origin = place("Milano", 45.46, 9.18);
    a.destination = place("Roma", 41.89, 12.49);
    const b = createEmptyTrip();
    b.origin = place("Milano", 45.46, 9.18);
    b.destination = place("Napoli", 40.85, 14.27);
    expect(tripHistoryFingerprint(a)).not.toBe(tripHistoryFingerprint(b));
  });

  it("removes and clears entries", () => {
    const trip = createEmptyTrip();
    trip.origin = place("A", 1, 2);
    trip.destination = place("B", 3, 4);
    const entry = recordTripHistory({ trip, routeSummary: { mode: "demo" } });
    removeTripHistoryEntry(entry.id);
    expect(listTripHistory()).toHaveLength(0);
    recordTripHistory({ trip, routeSummary: { mode: "demo" } });
    clearTripHistory();
    expect(listTripHistory()).toHaveLength(0);
  });
});

describe("formatRelativeIt", () => {
  it("formats recent timestamps", () => {
    const now = new Date();
    expect(formatRelativeIt(now.toISOString())).toBe("adesso");
    const minsAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeIt(minsAgo)).toBe("5 min fa");
  });
});
