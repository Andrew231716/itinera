import { describe, expect, it } from "vitest";
import {
  amenityLabel,
  mergeStations,
  midpoint,
  textMentions24h,
  textMentionsAdBlue,
} from "@/lib/fuel/helpers";
import { fuelStationToPlaceRef } from "@/lib/fuel/place-ref";
import type { FuelStation } from "@/lib/fuel/types";

function station(
  partial: Partial<FuelStation> & Pick<FuelStation, "id" | "name">,
): FuelStation {
  return {
    location: { lat: 45.358, lng: 9.324 },
    distanceMeters: 100,
    sources: ["openstreetmap"],
    mapsUrl: "https://maps.google.com",
    amenities: {},
    notes: [],
    verifyByPhone: true,
    ...partial,
  };
}

describe("fuel helpers", () => {
  it("detects AdBlue mentions", () => {
    expect(textMentionsAdBlue("Q8 AdBlue pompa")).toBe(true);
    expect(textMentionsAdBlue("urea disponibili")).toBe(true);
    expect(textMentionsAdBlue("solo benzina")).toBe(false);
  });

  it("detects H24 mentions", () => {
    expect(textMentions24h("Aperto 24 ore su 24")).toBe(true);
    expect(textMentions24h("H24")).toBe(true);
    expect(textMentions24h("chiuso la notte")).toBe(false);
  });

  it("labels amenities", () => {
    expect(amenityLabel("adblue")).toBe("AdBlue");
    expect(amenityLabel("open24h")).toBe("H24");
  });

  it("computes corridor midpoint", () => {
    const mid = midpoint({ lat: 45.36, lng: 9.32 }, { lat: 45.4, lng: 9.34 });
    expect(mid.lat).toBeCloseTo(45.38);
    expect(mid.lng).toBeCloseTo(9.33);
  });

  it("converts station to PlaceRef", () => {
    const place = fuelStationToPlaceRef(
      station({
        id: "ggl-fuel-ChIJ123",
        name: "Q8 – Via Emilia",
        address: "SS 9 Via Emilia 33, Melegnano",
        location: { lat: 45.358, lng: 9.324 },
      }),
    );
    expect(place.label).toBe("Q8 – Via Emilia");
    expect(place.placeId).toBe("ChIJ123");
    expect(place.location.lat).toBe(45.358);
  });

  it("merges nearby duplicate stations and keeps AdBlue signal", () => {
    const a = station({
      id: "a",
      name: "Q8",
      amenities: { adblue: "unknown" },
      sources: ["google_maps"],
      notes: ["AdBlue segnalato"],
    });
    const b = station({
      id: "b",
      name: "Q8 – Via Emilia",
      amenities: { adblue: "yes", open24h: "yes" },
      sources: ["openstreetmap"],
      phone: "800 010 808",
      notes: ["Aperto 24h"],
    });
    const merged = mergeStations([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amenities.adblue).toBe("yes");
    expect(merged[0].amenities.open24h).toBe("yes");
    expect(merged[0].phone).toBe("800 010 808");
    expect(merged[0].sources).toContain("google_maps");
    expect(merged[0].sources).toContain("openstreetmap");
    expect(merged[0].name).toContain("Via Emilia");
  });
});
