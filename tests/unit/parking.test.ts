import { describe, expect, it } from "vitest";
import { classifyFee, mergeSpots, mentionsEasyPark } from "@/lib/parking/helpers";
import { parkingSpotToPlaceRef } from "@/lib/parking/place-ref";
import { buildEasyParkFreeResults } from "@/lib/parking/easypark-free";
import type { ParkingSpot } from "@/lib/parking/types";

describe("parking helpers", () => {
  it("classifies free and paid OSM fees", () => {
    expect(classifyFee({ fee: "no" }).pricing).toBe("free");
    expect(classifyFee({ fee: "yes", charge: "2€/h" }).pricing).toBe("paid");
    expect(classifyFee({ fee: "yes", charge: "2€/h" }).summary).toContain("2");
    expect(classifyFee({}).pricing).toBe("unknown");
  });

  it("detects EasyPark mentions", () => {
    expect(mentionsEasyPark("Garage EasyPark Centro")).toBe(true);
    expect(mentionsEasyPark("Parcheggio Duomo")).toBe(false);
  });

  it("converts spot to PlaceRef", () => {
    const spot: ParkingSpot = {
      id: "osm-node-1",
      name: "Parcheggio Test",
      location: { lat: 45.46, lng: 9.19 },
      distanceMeters: 120,
      pricing: "paid",
      sources: ["openstreetmap"],
      mapsUrl: "https://maps.google.com",
    };
    const place = parkingSpotToPlaceRef(spot);
    expect(place.label).toBe("Parcheggio Test");
    expect(place.location.lat).toBe(45.46);
  });

  it("builds free EasyPark search results without partner API", () => {
    const { spots, limitations } = buildEasyParkFreeResults({
      center: { lat: 45.46, lng: 9.19 },
      label: "Milano",
    });
    expect(spots.length).toBeGreaterThan(0);
    expect(spots[0].easyPark?.searchUrl).toContain("google.com/maps");
    expect(spots[0].cost?.documentUrl).toMatch(/storyblok|easypark/i);
    expect(limitations.some((l) => /API/i.test(l))).toBe(true);
  });

  it("merges nearby duplicate spots", () => {
    const a: ParkingSpot = {
      id: "a",
      name: "A",
      location: { lat: 45.46, lng: 9.19 },
      distanceMeters: 10,
      pricing: "unknown",
      sources: ["google_maps"],
      mapsUrl: "x",
    };
    const b: ParkingSpot = {
      id: "b",
      name: "Parcheggio A lungo",
      location: { lat: 45.46, lng: 9.19 },
      distanceMeters: 12,
      pricing: "paid",
      sources: ["openstreetmap"],
      mapsUrl: "y",
    };
    const merged = mergeSpots([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toContain("google_maps");
    expect(merged[0].sources).toContain("openstreetmap");
    expect(merged[0].pricing).toBe("paid");
  });
});
