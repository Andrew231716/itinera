import { describe, expect, it } from "vitest";
import { effectiveNavHeading } from "@/lib/navigation/effective-heading";
import { destinationPoint } from "@/lib/navigation/destination-point";
import type { NavigationRuntime } from "@/lib/navigation/types";

function nav(partial: Partial<NavigationRuntime>): NavigationRuntime {
  return {
    status: "navigating",
    voiceEnabled: true,
    followMap: true,
    northUp: false,
    overview: false,
    hudSide: "right",
    recalculating: false,
    nextWaypointIndex: 0,
    lastArrivedWaypointId: null,
    position: { lat: 45.36, lng: 9.32 },
    headingDeg: null,
    compassHeadingDeg: null,
    accuracyMeters: 8,
    speedMps: null,
    progress: null,
    error: null,
    lastSpokenManeuverId: null,
    wakeLockActive: false,
    wakeLockMode: "inactive",
    platform: "web",
    ...partial,
  };
}

function onRouteProgress(bearing: number, crossTrack = 2) {
  return {
    snapped: { lat: 45.36, lng: 9.32 },
    segmentIndex: 0,
    traveledMeters: 0,
    remainingMeters: 1000,
    remainingSeconds: 100,
    crossTrackMeters: crossTrack,
    routeBearingDeg: bearing,
    currentManeuverIndex: 0,
    nextManeuver: null,
    metersToNextManeuver: 100,
    offRoute: false,
    arrived: false,
    nextWaypointIndex: 0,
    nextWaypointLabel: null,
    nextWaypointKind: null as null,
    metersToNextWaypoint: 0,
    atIntermediateStop: false,
    totalWaypoints: 0,
  };
}

describe("effectiveNavHeading", () => {
  it("prefers GPS course when moving off-route", () => {
    expect(
      effectiveNavHeading(
        nav({
          headingDeg: 90,
          compassHeadingDeg: 10,
          speedMps: 12,
          progress: onRouteProgress(0, 80),
        }),
      ),
    ).toBe(90);
  });

  it("locks to route bearing when on-route even if GPS differs a lot", () => {
    expect(
      effectiveNavHeading(
        nav({
          headingDeg: 90,
          compassHeadingDeg: 10,
          speedMps: 12,
          progress: onRouteProgress(0, 5),
        }),
      ),
    ).toBe(0);
  });

  it("uses compass when slow and off-route", () => {
    expect(
      effectiveNavHeading(
        nav({
          headingDeg: 90,
          compassHeadingDeg: 45,
          speedMps: 0.2,
          progress: onRouteProgress(0, 80),
        }),
      ),
    ).toBe(45);
  });

  it("falls back to route bearing", () => {
    expect(
      effectiveNavHeading(
        nav({
          progress: onRouteProgress(180),
        }),
      ),
    ).toBe(180);
  });
});

describe("destinationPoint", () => {
  it("moves roughly north", () => {
    const p = destinationPoint({ lat: 45, lng: 9 }, 0, 1000);
    expect(p.lat).toBeGreaterThan(45);
    expect(Math.abs(p.lng - 9)).toBeLessThan(0.01);
  });
});
