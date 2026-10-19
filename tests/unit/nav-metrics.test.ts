import { describe, expect, it } from "vitest";
import {
  formatClockIt,
  getNavTripMetrics,
} from "@/lib/navigation/nav-metrics";
import type { ComputedRoute } from "@/lib/types/route";
import type { NavProgress } from "@/lib/navigation/types";

function route(partial: Partial<ComputedRoute> = {}): ComputedRoute {
  return {
    id: "r1",
    label: "Test",
    distanceMeters: 10000,
    durationSeconds: 1200,
    staticDurationSeconds: 900,
    polyline: "",
    decodedPath: [
      { lat: 45.36, lng: 9.32 },
      { lat: 45.4, lng: 9.4 },
    ],
    legs: [],
    warnings: [],
    violations: [],
    engine: "google_routes",
    ...partial,
  };
}

function progress(partial: Partial<NavProgress> = {}): NavProgress {
  return {
    snapped: { lat: 45.36, lng: 9.32 },
    segmentIndex: 0,
    traveledMeters: 0,
    remainingMeters: 10000,
    remainingSeconds: 1200,
    crossTrackMeters: 2,
    routeBearingDeg: 45,
    currentManeuverIndex: 0,
    nextManeuver: null,
    metersToNextManeuver: 200,
    offRoute: false,
    arrived: false,
    nextWaypointIndex: 0,
    nextWaypointLabel: null,
    nextWaypointKind: null,
    metersToNextWaypoint: 0,
    atIntermediateStop: false,
    totalWaypoints: 0,
    ...partial,
  };
}

describe("nav metrics", () => {
  it("formats clock in Italian locale style", () => {
    const label = formatClockIt(new Date("2026-10-16T14:05:00"));
    expect(label).toMatch(/\d{2}:\d{2}/);
  });

  it("computes ETA and traffic delay for remaining trip", () => {
    const now = Date.parse("2026-10-16T10:00:00Z");
    const m = getNavTripMetrics(route(), progress(), now);
    expect(m.etaLabel).toMatch(/\d{2}:\d{2}/);
    expect(m.remainingMinutes).toBe(20);
    expect(m.level).not.toBe("unknown");
    expect(m.delayLabel).toMatch(/\+/);
    expect(m.remainingDelayMinutes).toBeGreaterThan(0);
  });

  it("scales delay with remaining distance", () => {
    const full = getNavTripMetrics(route(), progress({ remainingMeters: 10000 }));
    const half = getNavTripMetrics(route(), progress({ remainingMeters: 5000, remainingSeconds: 600 }));
    expect(half.remainingDelaySeconds).toBeLessThan(full.remainingDelaySeconds);
  });
});
