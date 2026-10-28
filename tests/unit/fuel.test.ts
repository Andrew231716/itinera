import { describe, expect, it } from "vitest";
import {
  brandLabel,
  normalizeBrandKey,
  stationMatchesBrand,
} from "@/lib/fuel/brands";
import {
  amenityLabel,
  corridorDistance,
  mapsDirectionsUrl,
  mergeStations,
  midpoint,
  pickHighlightPrices,
  rankStations,
  stationHasLpg,
  textMentions24h,
  textMentionsAdBlue,
  textMentionsLpg,
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

  it("detects GPL / LPG mentions and station signal", () => {
    expect(textMentionsLpg("Distributore GPL Eni")).toBe(true);
    expect(textMentionsLpg("LPG available")).toBe(true);
    expect(textMentionsLpg("solo gasolio")).toBe(false);
    expect(
      stationHasLpg(
        station({
          id: "lpg1",
          name: "Eni",
          amenities: { lpg: "yes" },
        }),
      ),
    ).toBe(true);
    expect(
      stationHasLpg(
        station({
          id: "lpg2",
          name: "IP",
          prices: [
            { fuel: "GPL", price: 0.7, isSelf: true },
          ],
        }),
      ),
    ).toBe(true);
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

  it("merges stations within ~45m even with slightly different coords", () => {
    const a = station({
      id: "a",
      name: "Eni",
      location: { lat: 45.358, lng: 9.324 },
      sources: ["google_maps"],
    });
    const b = station({
      id: "b",
      name: "Eni Station",
      location: { lat: 45.3582, lng: 9.3241 },
      amenities: { adblue: "yes" },
      sources: ["openstreetmap"],
    });
    expect(mergeStations([a, b])).toHaveLength(1);
  });

  it("ranks AdBlue stations before others", () => {
    const farAdblue = station({
      id: "far",
      name: "Q8 AdBlue",
      distanceMeters: 5000,
      amenities: { adblue: "yes" },
    });
    const near = station({
      id: "near",
      name: "IP",
      distanceMeters: 200,
      amenities: { adblue: "unknown" },
    });
    const ranked = rankStations([near, farAdblue]);
    expect(ranked[0].id).toBe("far");
  });

  it("uses min corridor distance", () => {
    const d = corridorDistance(
      { lat: 45.4, lng: 9.34 },
      [
        { lat: 45.36, lng: 9.32 },
        { lat: 45.4, lng: 9.34 },
      ],
    );
    expect(d).toBe(0);
  });

  it("normalizes Italian fuel brands", () => {
    expect(normalizeBrandKey("AgipEni")).toBe("eni");
    expect(normalizeBrandKey("Q8 easy")).toBe("q8");
    expect(normalizeBrandKey("Api-Ip")).toBe("ip");
    expect(brandLabel("eni")).toBe("Eni");
    expect(
      stationMatchesBrand({ brandKey: "q8", name: "Q8 Via Emilia" }, "q8"),
    ).toBe(true);
    expect(
      stationMatchesBrand({ brandKey: "eni", name: "Eni" }, "q8"),
    ).toBe(false);
  });

  it("builds driving directions URL", () => {
    const url = mapsDirectionsUrl({
      origin: { lat: 45.36, lng: 9.32 },
      destination: { lat: 45.4, lng: 9.34 },
    });
    expect(url).toContain("google.com/maps/dir");
    expect(url).toContain("travelmode=driving");
    expect(url).toContain("45.360000");
  });

  it("picks highlight self-service prices", () => {
    const picks = pickHighlightPrices([
      { fuel: "Benzina", price: 2.2, isSelf: false },
      { fuel: "Benzina", price: 1.99, isSelf: true },
      { fuel: "Gasolio", price: 2.1, isSelf: true },
      { fuel: "GPL", price: 0.75, isSelf: false },
    ]);
    expect(picks.map((p) => p.fuel)).toEqual(["Benzina", "Gasolio", "GPL"]);
    expect(picks[0].isSelf).toBe(true);
    expect(picks[0].price).toBe(1.99);
  });

  it("keeps MIMIT prices when merging OSM + Osservaprezzi", () => {
    const a = station({
      id: "osm",
      name: "Q8",
      sources: ["openstreetmap"],
      amenities: { adblue: "yes" },
    });
    const b = station({
      id: "ospz",
      name: "Q8 Melegnano",
      sources: ["osservaprezzi"],
      prices: [{ fuel: "Benzina", price: 1.999, isSelf: true }],
    });
    const merged = mergeStations([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].prices?.[0]?.price).toBe(1.999);
    expect(merged[0].amenities.adblue).toBe("yes");
    expect(merged[0].sources).toContain("osservaprezzi");
  });
});
