/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  formatOfflineSize,
  getOfflineTrip,
  listOfflineTrips,
  removeOfflineTrip,
  saveOfflineTrip,
} from "@/lib/storage/offline-trips";
import { createEmptyTrip } from "@/lib/types/trip";
import type { ComputedRoute } from "@/lib/types/route";
import { lerpHeading, lerpLatLng } from "@/lib/navigation/smooth";

function sampleRoute(): ComputedRoute {
  return {
    id: "r1",
    label: "Test",
    distanceMeters: 1000,
    durationSeconds: 120,
    polyline: "",
    decodedPath: [
      { lat: 45.36, lng: 9.32 },
      { lat: 45.37, lng: 9.33 },
    ],
    legs: [],
    warnings: [],
    violations: [],
    engine: "demo",
  };
}

describe("offline trips", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and lists a pack", () => {
    const trip = createEmptyTrip("Weekend");
    trip.origin = {
      id: "a",
      label: "A",
      location: { lat: 45.36, lng: 9.32 },
      source: "manual",
    };
    trip.destination = {
      id: "b",
      label: "B",
      location: { lat: 45.37, lng: 9.33 },
      source: "manual",
    };
    const pack = saveOfflineTrip({
      trip,
      routes: [sampleRoute()],
      selectedRouteId: "r1",
    });
    expect(pack.sizeBytes).toBeGreaterThan(10);
    expect(listOfflineTrips()).toHaveLength(1);
    expect(getOfflineTrip(pack.id)?.title).toBe("Weekend");
    removeOfflineTrip(pack.id);
    expect(listOfflineTrips()).toHaveLength(0);
  });

  it("formats sizes", () => {
    expect(formatOfflineSize(500)).toContain("B");
    expect(formatOfflineSize(2048)).toContain("KB");
  });
});

describe("smooth lerp", () => {
  it("interpolates heading across 0°", () => {
    const h = lerpHeading(350, 10, 0.5);
    // Midpoint wraps to ~0°
    expect(h === 0 || h > 355 || h < 5).toBe(true);
  });

  it("interpolates latlng", () => {
    const p = lerpLatLng(
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      0.5,
    );
    expect(p.lat).toBe(5);
    expect(p.lng).toBe(5);
  });
});
