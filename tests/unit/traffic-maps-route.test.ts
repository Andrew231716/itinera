import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsDirectionsLink,
  sampleRoutePathAsWaypoints,
} from "@/lib/google/maps-links";
import { getTrafficInfo } from "@/lib/routing/traffic-info";
import type { ComputedRoute } from "@/lib/types/route";
import { DEFAULT_ROAD_PREFERENCES, type PlaceRef } from "@/lib/types/trip";

const place = (label: string, lat: number, lng: number): PlaceRef => ({
  id: label,
  label,
  location: { lat, lng },
  source: "demo",
});

function routeStub(
  partial: Partial<ComputedRoute> & Pick<ComputedRoute, "id" | "label">,
): ComputedRoute {
  return {
    distanceMeters: 100_000,
    durationSeconds: 3600,
    polyline: "",
    decodedPath: [],
    legs: [],
    warnings: [],
    violations: [],
    engine: "google_routes",
    ...partial,
  };
}

describe("getTrafficInfo", () => {
  it("marks fluid traffic when delay is small", () => {
    const info = getTrafficInfo(
      routeStub({
        id: "a",
        label: "A",
        durationSeconds: 3700,
        staticDurationSeconds: 3600,
      }),
    );
    expect(info.level).toBe("fluid");
    expect(info.delaySeconds).toBe(100);
  });

  it("marks heavy traffic when delay ratio is high", () => {
    const info = getTrafficInfo(
      routeStub({
        id: "b",
        label: "B",
        durationSeconds: 4320, // +20% → heavy (< 30%)
        staticDurationSeconds: 3600,
      }),
    );
    expect(info.level).toBe("heavy");
    expect(info.delaySeconds).toBe(720);
  });

  it("returns unknown without static duration", () => {
    const info = getTrafficInfo(
      routeStub({ id: "c", label: "C", durationSeconds: 3600 }),
    );
    expect(info.level).toBe("unknown");
  });
});

describe("Maps locked to Itinera route", () => {
  it("embeds different waypoints for different route geometries", () => {
    const pathA = Array.from({ length: 30 }, (_, i) => ({
      lat: 45 + i * 0.02,
      lng: 9 + i * 0.01,
    }));
    const pathB = Array.from({ length: 30 }, (_, i) => ({
      lat: 45 + i * 0.01,
      lng: 9 + i * 0.03,
    }));

    const linkA = buildGoogleMapsDirectionsLink({
      origin: place("Milano", 45, 9),
      destination: place("Roma", 41, 12),
      stops: [],
      travelMode: "DRIVE",
      preferences: DEFAULT_ROAD_PREFERENCES,
      routePath: pathA,
      routeLabel: "Percorso consigliato",
    });
    const linkB = buildGoogleMapsDirectionsLink({
      origin: place("Milano", 45, 9),
      destination: place("Roma", 41, 12),
      stops: [],
      travelMode: "DRIVE",
      preferences: DEFAULT_ROAD_PREFERENCES,
      routePath: pathB,
      routeLabel: "Alternativa 1",
    });

    expect(linkA.lockedToItineraRoute).toBe(true);
    expect(linkB.lockedToItineraRoute).toBe(true);
    expect(linkA.shapeWaypointCount).toBeGreaterThan(0);
    expect(linkA.routeLabel).toBe("Percorso consigliato");
    expect(linkA.url).toContain("waypoints=");
    expect(linkA.url).not.toBe(linkB.url);
    expect(linkA.preview.note).toContain("Percorso consigliato");
  });

  it("samples by distance along uneven paths", () => {
    // Dense start, sparse end — index sampling would cluster near start
    const path = [
      { lat: 45.0, lng: 9.0 },
      { lat: 45.001, lng: 9.001 },
      { lat: 45.002, lng: 9.002 },
      { lat: 45.003, lng: 9.003 },
      { lat: 45.5, lng: 9.5 },
      { lat: 46.0, lng: 10.0 },
    ];
    const samples = sampleRoutePathAsWaypoints(path, 3);
    expect(samples).toHaveLength(3);
    // Mid sample should not stay stuck near the dense cluster
    expect(samples[1].location.lat).toBeGreaterThan(45.05);
  });
});
