import { describe, expect, it } from "vitest";
import {
  placesToMapPoints,
  projectGiroPoints,
} from "@/lib/giro/giro-map-draw";
import type { PlaceRef } from "@/lib/types/trip";

function place(label: string, lat: number, lng: number): PlaceRef {
  return {
    id: label,
    label,
    location: { lat, lng },
    source: "manual",
  };
}

describe("projectGiroPoints", () => {
  it("keeps points inside the padded canvas", () => {
    const pts = projectGiroPoints(
      [
        { lat: 45, lng: 9 },
        { lat: 45.2, lng: 9.3 },
        { lat: 44.9, lng: 9.1 },
      ],
      400,
      300,
      40,
    );
    expect(pts).toHaveLength(3);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(360);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(260);
    }
  });
});

describe("placesToMapPoints", () => {
  it("numbers origin then stops", () => {
    const points = placesToMapPoints(place("A", 45, 9), [
      place("B", 45.1, 9.1),
      place("C", 45.2, 9.2),
    ]);
    expect(points.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(points.map((p) => p.label)).toEqual(["A", "B", "C"]);
  });
});
