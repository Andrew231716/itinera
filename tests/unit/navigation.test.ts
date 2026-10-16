import { describe, expect, it } from "vitest";
import {
  bearingDegrees,
  closestPointOnSegment,
  pathCumulativeMeters,
  snapToPath,
} from "@/lib/navigation/geometry-nav";
import { buildManeuvers, findCurrentManeuverIndex } from "@/lib/navigation/maneuvers";
import { computeNavProgress } from "@/lib/navigation/progress";
import type { ComputedRoute } from "@/lib/types/route";

function sampleRoute(): ComputedRoute {
  const path = [
    { lat: 45.36, lng: 9.32 },
    { lat: 45.37, lng: 9.33 },
    { lat: 45.38, lng: 9.34 },
    { lat: 45.39, lng: 9.35 },
  ];
  return {
    id: "r1",
    label: "Test",
    distanceMeters: 4000,
    durationSeconds: 600,
    polyline: "",
    decodedPath: path,
    legs: [
      {
        id: "leg-0",
        startLabel: "A",
        endLabel: "B",
        distanceMeters: 4000,
        durationSeconds: 600,
        steps: [
          {
            id: "s0",
            instruction: "Procedi verso nord",
            distanceMeters: 2000,
            durationSeconds: 300,
          },
          {
            id: "s1",
            instruction: "Svolta a destra",
            distanceMeters: 2000,
            durationSeconds: 300,
          },
        ],
      },
    ],
    warnings: [],
    violations: [],
    engine: "demo",
  };
}

describe("navigation geometry", () => {
  it("computes bearing roughly north-east along sample", () => {
    const b = bearingDegrees(
      { lat: 45.36, lng: 9.32 },
      { lat: 45.37, lng: 9.33 },
    );
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(90);
  });

  it("snaps a nearby point onto the path", () => {
    const path = sampleRoute().decodedPath;
    const snap = snapToPath({ lat: 45.3701, lng: 9.3301 }, path);
    expect(snap).not.toBeNull();
    expect(snap!.crossTrackMeters).toBeLessThan(40);
    expect(snap!.traveledMeters).toBeGreaterThan(0);
  });

  it("finds closest point on segment", () => {
    const { t, distanceMeters } = closestPointOnSegment(
      { lat: 45.365, lng: 9.325 },
      { lat: 45.36, lng: 9.32 },
      { lat: 45.37, lng: 9.33 },
    );
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(distanceMeters).toBeLessThan(200);
  });

  it("builds cumulative distances", () => {
    const cum = pathCumulativeMeters(sampleRoute().decodedPath);
    expect(cum[0]).toBe(0);
    expect(cum[cum.length - 1]).toBeGreaterThan(1000);
  });
});

describe("navigation maneuvers", () => {
  it("builds maneuvers from route steps", () => {
    const m = buildManeuvers(sampleRoute());
    expect(m.length).toBeGreaterThanOrEqual(2);
    expect(m[0].instruction).toMatch(/Procedi|parti|nord/i);
  });

  it("advances maneuver index along travel", () => {
    const m = buildManeuvers(sampleRoute());
    expect(findCurrentManeuverIndex(m, 0)).toBeGreaterThanOrEqual(0);
    const late = findCurrentManeuverIndex(m, 3500);
    expect(late).toBeGreaterThanOrEqual(1);
  });

  it("detects off-route when far from path", () => {
    const route = sampleRoute();
    const maneuvers = buildManeuvers(route);
    const far = computeNavProgress({
      position: { lat: 45.5, lng: 9.5 },
      route,
      maneuvers,
    });
    expect(far?.offRoute).toBe(true);
  });

  it("is on-route when near the polyline", () => {
    const route = sampleRoute();
    const maneuvers = buildManeuvers(route);
    const near = computeNavProgress({
      position: { lat: 45.37005, lng: 9.33005 },
      route,
      maneuvers,
    });
    expect(near?.offRoute).toBe(false);
    expect(near?.remainingMeters).toBeGreaterThan(0);
  });
});
