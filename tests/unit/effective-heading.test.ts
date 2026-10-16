import { describe, expect, it } from "vitest";
import { effectiveNavHeading } from "@/lib/navigation/effective-heading";
import { destinationPoint } from "@/lib/navigation/destination-point";
import type { NavigationRuntime } from "@/lib/navigation/types";

function nav(partial: Partial<NavigationRuntime>): NavigationRuntime {
  return {
    status: "navigating",
    voiceEnabled: true,
    followMap: true,
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

describe("effectiveNavHeading", () => {
  it("prefers GPS course when moving", () => {
    expect(
      effectiveNavHeading(
        nav({ headingDeg: 90, compassHeadingDeg: 10, speedMps: 12 }),
      ),
    ).toBe(90);
  });

  it("uses compass when slow", () => {
    expect(
      effectiveNavHeading(
        nav({ headingDeg: 90, compassHeadingDeg: 45, speedMps: 0.2 }),
      ),
    ).toBe(45);
  });

  it("falls back to route bearing", () => {
    expect(
      effectiveNavHeading(
        nav({
          progress: {
            snapped: { lat: 45.36, lng: 9.32 },
            segmentIndex: 0,
            traveledMeters: 0,
            remainingMeters: 1000,
            remainingSeconds: 100,
            crossTrackMeters: 0,
            routeBearingDeg: 180,
            currentManeuverIndex: 0,
            nextManeuver: null,
            metersToNextManeuver: 100,
            offRoute: false,
            arrived: false,
          },
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
