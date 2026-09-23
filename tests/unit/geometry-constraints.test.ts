import { describe, expect, it } from "vitest";
import {
  checkRouteConstraintsDetailed,
  isRouteConformant,
  rankRoutesByConstraints,
} from "@/lib/routing/constraint-checker";
import {
  decodePolyline,
  isValidPolygon,
  pointInPolygon,
  pathIntersectsPolygon,
} from "@/lib/utils/geometry";
import type { CustomExclusion } from "@/lib/types/trip";

describe("geometry", () => {
  it("validates polygons", () => {
    expect(
      isValidPolygon([
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
      ]).valid,
    ).toBe(false);
    expect(
      isValidPolygon([
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
        { lat: 1, lng: 0 },
      ]).valid,
    ).toBe(true);
  });

  it("treats edge points as inside polygon", () => {
    const poly = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 0, lng: 1 }, poly)).toBe(true);
    expect(pointInPolygon({ lat: 1, lng: 1 }, poly)).toBe(true);
    expect(pointInPolygon({ lat: 3, lng: 3 }, poly)).toBe(false);
  });

  it("detects path intersecting zone", () => {
    const poly = [
      { lat: 45, lng: 9 },
      { lat: 45, lng: 10 },
      { lat: 46, lng: 10 },
      { lat: 46, lng: 9 },
    ];
    const path = [
      { lat: 44.5, lng: 9.5 },
      { lat: 45.5, lng: 9.5 },
      { lat: 46.5, lng: 9.5 },
    ];
    expect(pathIntersectsPolygon(path, poly)).toBe(true);
  });

  it("decodes a simple polyline", () => {
    // Encoded for a couple of points near 38.5,-120.2
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC");
    expect(pts.length).toBeGreaterThan(0);
    expect(pts[0].lat).toBeCloseTo(38.5, 1);
  });
});

describe("constraints", () => {
  const zone: CustomExclusion = {
    id: "z1",
    kind: "geo_zone",
    label: "Zona test",
    strength: "hard",
    polygon: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ],
    createdAt: new Date().toISOString(),
  };

  it("marks empty path as unverifiable", () => {
    const result = checkRouteConstraintsDetailed([], [zone]);
    expect(result.violations).toHaveLength(0);
    expect(result.unverifiable).toHaveLength(1);
    expect(isRouteConformant(result.violations, result.unverifiable, [zone])).toBe(
      false,
    );
  });

  it("flags non-conformant path through zone", () => {
    const path = [
      { lat: -1, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 3, lng: 1 },
    ];
    const result = checkRouteConstraintsDetailed(path, [zone]);
    expect(result.violations.some((v) => v.severity === "hard")).toBe(true);
  });

  it("ranks conformant routes first", () => {
    const ranked = rankRoutesByConstraints([
      {
        durationSeconds: 100,
        violations: [
          {
            exclusionId: "z1",
            exclusionLabel: "Zona",
            severity: "hard" as const,
            message: "x",
          },
        ],
      },
      { durationSeconds: 200, violations: [] },
    ]);
    expect(ranked[0].durationSeconds).toBe(200);
  });
});
