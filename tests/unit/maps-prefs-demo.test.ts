import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsDirectionsLink,
  MAX_WAYPOINTS_IN_URL,
} from "@/lib/google/maps-links";
import { describePreferenceStatuses } from "@/lib/routing/preference-mapper";
import { DEFAULT_ROAD_PREFERENCES, type PlaceRef } from "@/lib/types/trip";
import { buildDemoRouteResponse } from "@/lib/google/routes-client";

const place = (label: string, lat: number, lng: number): PlaceRef => ({
  id: label,
  label,
  location: { lat, lng },
  source: "demo",
});

describe("maps links", () => {
  it("includes avoid preferences when set", () => {
    const link = buildGoogleMapsDirectionsLink({
      origin: place("A", 45, 9),
      destination: place("B", 41, 12),
      stops: [],
      travelMode: "DRIVE",
      preferences: { ...DEFAULT_ROAD_PREFERENCES, avoidTolls: true },
    });
    expect(link.url).toContain("avoid=tolls");
    expect(link.includedPreferences).toContain("Evita pedaggi");
    expect(link.omitted.some((o) => o.includes("Esclusioni"))).toBe(true);
  });

  it("segments when too many stops without dropping them", () => {
    const stops = Array.from({ length: MAX_WAYPOINTS_IN_URL + 3 }, (_, i) =>
      place(`S${i}`, 44 + i * 0.1, 10),
    );
    const link = buildGoogleMapsDirectionsLink({
      origin: place("A", 45, 9),
      destination: place("B", 41, 12),
      stops,
      travelMode: "DRIVE",
      preferences: DEFAULT_ROAD_PREFERENCES,
    });
    expect(link.requiresSegmentation).toBe(true);
    expect(link.segments?.length).toBe(stops.length + 1);
    expect(link.preview.stops).toHaveLength(stops.length);
  });

  it("builds malformed-safe encode with coordinates", () => {
    const link = buildGoogleMapsDirectionsLink({
      origin: place("A", 45.1, 9.2),
      destination: place("B", 41.9, 12.5),
      stops: [],
      travelMode: "WALK",
      preferences: DEFAULT_ROAD_PREFERENCES,
    });
    expect(link.url).toContain("travelmode=walking");
    expect(link.url).toContain("45.1");
  });
});

describe("preferences status", () => {
  it("marks tunnels as unsupported", () => {
    const statuses = describePreferenceStatuses({
      ...DEFAULT_ROAD_PREFERENCES,
      avoidTunnels: true,
    });
    const tunnel = statuses.find((s) => s.key === "avoidTunnels");
    expect(tunnel?.status).toBe("unsupported");
  });
});

describe("demo routing", () => {
  it("never invents routes", () => {
    const res = buildDemoRouteResponse({
      origin: place("A", 45, 9),
      destination: place("B", 41, 12),
      intermediates: [],
      travelMode: "DRIVE",
      departureAt: null,
      preferences: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false,
        preferFastest: true,
        preferShortest: false,
      },
      optimizeWaypointOrder: false,
      exclusions: [],
    });
    expect(res.mode).toBe("demo");
    expect(res.routes).toEqual([]);
    expect(res.limitations.length).toBeGreaterThan(0);
  });
});
