import { describe, expect, it } from "vitest";
import {
  createPointExclusion,
  offsetLatLng,
  suggestedExclusionRadiusMeters,
} from "@/lib/routing/exclusion-helpers";
import type { PlaceRef } from "@/lib/types/trip";

const place: PlaceRef = {
  id: "p1",
  label: "Chiasso",
  location: { lat: 45.835, lng: 9.032 },
  source: "places",
};

describe("exclusion helpers", () => {
  it("uses larger radius for dogana / border labels", () => {
    expect(suggestedExclusionRadiusMeters("address", "dogana di Chiasso")).toBe(
      3500,
    );
    expect(suggestedExclusionRadiusMeters("city", "Lugano")).toBe(10000);
  });

  it("creates point exclusions with suggested radius", () => {
    const ex = createPointExclusion({
      id: "x1",
      kind: "address",
      label: "dogana di Chiasso",
      place,
    });
    expect(ex.radiusMeters).toBe(3500);
    expect(ex.strength).toBe("hard");
  });

  it("offsets lat/lng roughly by requested distance", () => {
    const north = offsetLatLng(place.location, 0, 1000);
    expect(north.lat).toBeGreaterThan(place.location.lat);
    expect(Math.abs(north.lng - place.location.lng)).toBeLessThan(0.01);
  });
});
