import { describe, expect, it } from "vitest";
import {
  buildNavWaypoints,
  computeWaypointProgress,
  remainingStopPlaces,
} from "@/lib/navigation/waypoints";
import type { ComputedRoute } from "@/lib/types/route";
import type { PlaceRef, TripStop } from "@/lib/types/trip";

function place(id: string, label: string, lat: number, lng: number): PlaceRef {
  return {
    id,
    label,
    location: { lat, lng },
    source: "places",
  };
}

function routeWithLegs(): ComputedRoute {
  return {
    id: "r",
    label: "multi",
    distanceMeters: 3000,
    durationSeconds: 600,
    polyline: "",
    decodedPath: [
      { lat: 45.36, lng: 9.32 },
      { lat: 45.37, lng: 9.33 },
      { lat: 45.38, lng: 9.34 },
      { lat: 45.39, lng: 9.35 },
    ],
    legs: [
      {
        id: "l0",
        startLabel: "A",
        endLabel: "Stop1",
        distanceMeters: 1000,
        durationSeconds: 200,
        steps: [],
      },
      {
        id: "l1",
        startLabel: "Stop1",
        endLabel: "Stop2",
        distanceMeters: 1000,
        durationSeconds: 200,
        steps: [],
      },
      {
        id: "l2",
        startLabel: "Stop2",
        endLabel: "Dest",
        distanceMeters: 1000,
        durationSeconds: 200,
        steps: [],
      },
    ],
    warnings: [],
    violations: [],
    engine: "demo",
  };
}

describe("buildNavWaypoints", () => {
  it("orders stops then destination", () => {
    const stops: TripStop[] = [
      { id: "s1", place: place("p1", "Via Uno", 45.37, 9.33) },
      { id: "s2", place: place("p2", "Via Due", 45.38, 9.34) },
    ];
    const dest = place("d", "Finale", 45.39, 9.35);
    const wp = buildNavWaypoints({ stops, destination: dest });
    expect(wp.map((w) => w.label)).toEqual(["Via Uno", "Via Due", "Finale"]);
    expect(wp[2].kind).toBe("destination");
  });
});

describe("remainingStopPlaces", () => {
  it("drops visited stops by waypoint index", () => {
    const stops: TripStop[] = [
      { id: "s1", place: place("p1", "A", 1, 1) },
      { id: "s2", place: place("p2", "B", 2, 2) },
      { id: "s3", place: place("p3", "C", 3, 3) },
    ];
    expect(remainingStopPlaces(stops, 0).map((p) => p.label)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(remainingStopPlaces(stops, 2).map((p) => p.label)).toEqual(["C"]);
    expect(remainingStopPlaces(stops, 3)).toEqual([]);
  });
});

describe("computeWaypointProgress", () => {
  it("targets first stop early on the route", () => {
    const route = routeWithLegs();
    const waypoints = buildNavWaypoints({
      stops: [
        { id: "s1", place: place("p1", "Stop1", 45.37, 9.33) },
        { id: "s2", place: place("p2", "Stop2", 45.38, 9.34) },
      ],
      destination: place("d", "Dest", 45.39, 9.35),
    });
    const early = computeWaypointProgress({
      position: { lat: 45.3601, lng: 9.3201 },
      traveledMeters: 50,
      route,
      waypoints,
      committedIndex: 0,
    });
    expect(early.nextWaypointIndex).toBe(0);
    expect(early.nextWaypoint?.label).toBe("Stop1");
    expect(early.atFinalDestination).toBe(false);
  });

  it("advances after passing first leg", () => {
    const route = routeWithLegs();
    const waypoints = buildNavWaypoints({
      stops: [
        { id: "s1", place: place("p1", "Stop1", 45.37, 9.33) },
        { id: "s2", place: place("p2", "Stop2", 45.38, 9.34) },
      ],
      destination: place("d", "Dest", 45.39, 9.35),
    });
    const mid = computeWaypointProgress({
      position: { lat: 45.375, lng: 9.335 },
      traveledMeters: 1100,
      route,
      waypoints,
      committedIndex: 0,
    });
    expect(mid.nextWaypointIndex).toBeGreaterThanOrEqual(1);
  });

  it("holds on intermediate arrival before advancing", () => {
    const route = routeWithLegs();
    const waypoints = buildNavWaypoints({
      stops: [
        { id: "s1", place: place("p1", "Stop1", 45.37, 9.33) },
        { id: "s2", place: place("p2", "Stop2", 45.38, 9.34) },
      ],
      destination: place("d", "Dest", 45.39, 9.35),
    });
    const atStop = computeWaypointProgress({
      position: { lat: 45.37, lng: 9.33 },
      traveledMeters: 1000,
      route,
      waypoints,
      committedIndex: 0,
    });
    expect(atStop.nextWaypointIndex).toBe(0);
    expect(atStop.atIntermediateStop).toBe(true);
    expect(atStop.nextWaypoint?.label).toBe("Stop1");
    expect(atStop.atFinalDestination).toBe(false);
  });
});
