import { describe, expect, it } from "vitest";
import {
  detectMilanTrafficZones,
  MILAN_AREA_B,
  MILAN_AREA_C,
} from "@/lib/geo/milan-traffic-zones";
import { sampleRoutePathAsWaypoints } from "@/lib/google/maps-links";
import { pointInPolygon } from "@/lib/utils/geometry";

describe("sampleRoutePathAsWaypoints", () => {
  it("samples intermediate points from a long path", () => {
    const path = Array.from({ length: 40 }, (_, i) => ({
      lat: 45 + i * 0.01,
      lng: 9 + i * 0.01,
    }));
    const samples = sampleRoutePathAsWaypoints(path, 8);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(8);
    expect(samples[0].location.lat).not.toBe(path[0].lat);
  });
});

describe("milan traffic zones", () => {
  it("detects Area C for a path through the historic center", () => {
    const duomo = { lat: 45.4642, lng: 9.19 };
    expect(pointInPolygon(duomo, MILAN_AREA_C)).toBe(true);
    const hits = detectMilanTrafficZones([
      { lat: 45.48, lng: 9.19 },
      duomo,
      { lat: 45.45, lng: 9.19 },
    ]);
    expect(hits.some((h) => h.id === "area_c")).toBe(true);
    expect(hits.some((h) => h.id === "area_b")).toBe(true);
  });

  it("detects Area B without Area C for an outer path", () => {
    // Point inside Area B polygon but outside Area C (north of center)
    const outer = { lat: 45.505, lng: 9.19 };
    expect(pointInPolygon(outer, MILAN_AREA_B)).toBe(true);
    expect(pointInPolygon(outer, MILAN_AREA_C)).toBe(false);
    const hits = detectMilanTrafficZones([
      { lat: 45.52, lng: 9.19 },
      outer,
      { lat: 45.5, lng: 9.2 },
    ]);
    expect(hits.some((h) => h.id === "area_b")).toBe(true);
    expect(hits.some((h) => h.id === "area_c")).toBe(false);
  });
});
