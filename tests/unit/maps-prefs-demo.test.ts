import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsDirectionsLink,
  MAX_WAYPOINTS_IN_URL,
} from "@/lib/google/maps-links";
import {
  placeFromCoordinates,
  reverseGeocode,
} from "@/lib/google/places-client";
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

  it("builds lat/lng URLs without fragile place_id: values", () => {
    const link = buildGoogleMapsDirectionsLink({
      origin: place("A", 45.1, 9.2),
      destination: place("B", 41.9, 12.5),
      stops: [],
      travelMode: "WALK",
      preferences: DEFAULT_ROAD_PREFERENCES,
    });
    expect(link.url).toContain("travelmode=walking");
    expect(link.url).toContain("45.100000");
    expect(link.url).not.toContain("place_id%3A");
    expect(link.url).not.toContain("place_id:");
  });

  it("uses origin_place_id / destination_place_id when available", () => {
    const origin: PlaceRef = {
      ...place("Rozzano", 45.3819, 9.1547),
      placeId: "places/ChIJorigin1234567890",
      address: "Rozzano, MI, Italia",
    };
    const destination: PlaceRef = {
      ...place("Roma", 41.9028, 12.4964),
      placeId: "ChIJdest123456789012",
      address: "Roma, RM, Italia",
    };
    const link = buildGoogleMapsDirectionsLink({
      origin,
      destination,
      stops: [],
      travelMode: "DRIVE",
      preferences: DEFAULT_ROAD_PREFERENCES,
    });
    expect(link.url).toContain("origin_place_id=ChIJorigin1234567890");
    expect(link.url).toContain("destination_place_id=ChIJdest123456789012");
    expect(link.url).toContain("45.381900");
    expect(link.url).toContain("41.902800");
    expect(link.url).not.toContain("place_id%3A");
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

describe("gps place helpers", () => {
  it("builds a gps PlaceRef from coordinates", () => {
    const p = placeFromCoordinates(45.4642, 9.19);
    expect(p.source).toBe("gps");
    expect(p.label).toBe("Posizione attuale");
    expect(p.location.lat).toBeCloseTo(45.4642, 5);
  });

  it("reverseGeocode without API key returns demo gps place", async () => {
    const res = await reverseGeocode(45.46, 9.19, undefined);
    expect(res.mode).toBe("demo");
    expect(res.place.source).toBe("gps");
    expect(res.place.location.lat).toBeCloseTo(45.46, 4);
  });
});
