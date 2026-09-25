import { describe, expect, it } from "vitest";
import {
  matchCountryZone,
  SWITZERLAND_ZONE,
} from "@/lib/geo/country-zones";
import {
  createCountryExclusion,
  createExclusionFromLabel,
} from "@/lib/routing/exclusion-helpers";
import {
  checkRouteConstraintsDetailed,
  isRouteConformant,
} from "@/lib/routing/constraint-checker";
import { pointInPolygon } from "@/lib/utils/geometry";
import { buildGoogleMapsDirectionsLink } from "@/lib/google/maps-links";
import { DEFAULT_ROAD_PREFERENCES, type PlaceRef } from "@/lib/types/trip";

const place = (label: string, lat: number, lng: number): PlaceRef => ({
  id: label,
  label,
  location: { lat, lng },
  source: "manual",
});

describe("Switzerland country exclusion", () => {
  it("matches common labels", () => {
    expect(matchCountryZone("Svizzera")?.id).toBe("country_ch");
    expect(matchCountryZone("evita la Svizzera")?.id).toBe("country_ch");
    expect(matchCountryZone("Switzerland")?.id).toBe("country_ch");
    expect(matchCountryZone("CH")?.id).toBe("country_ch");
    expect(matchCountryZone("Bologna")).toBeNull();
  });

  it("polygon covers Ticino corridor but not Milan", () => {
    expect(pointInPolygon({ lat: 46.0, lng: 8.95 }, SWITZERLAND_ZONE.polygon)).toBe(
      true,
    ); // Lugano
    expect(pointInPolygon({ lat: 45.835, lng: 9.032 }, SWITZERLAND_ZONE.polygon)).toBe(
      true,
    ); // Chiasso
    expect(pointInPolygon({ lat: 45.464, lng: 9.19 }, SWITZERLAND_ZONE.polygon)).toBe(
      false,
    ); // Milano
  });

  it("marks Lugano→Milano via Chiasso as non-conformant", () => {
    const exclusion = createCountryExclusion({
      id: "ex-ch",
      label: "Svizzera",
    });
    expect(exclusion).not.toBeNull();

    // Path that enters Switzerland then exits to Milan
    const path = [
      { lat: 45.9, lng: 9.1 }, // near Como (IT) approaching
      { lat: 45.835, lng: 9.032 }, // Chiasso (CH)
      { lat: 45.81, lng: 9.08 }, // south of border
      { lat: 45.46, lng: 9.19 }, // Milano
    ];
    const detailed = checkRouteConstraintsDetailed(path, [exclusion!]);
    expect(detailed.violations.some((v) => v.severity === "hard")).toBe(true);
    expect(
      isRouteConformant(detailed.violations, detailed.unverifiable, [
        exclusion!,
      ]),
    ).toBe(false);
  });

  it("still flags transit when origin is already in Switzerland", () => {
    const exclusion = createCountryExclusion({
      id: "ex-ch",
      label: "Svizzera",
    });
    // Lugano → Mendrisio → Chiasso → Milano: deep CH transit beyond 8 km buffer
    const path = [
      { lat: 46.0, lng: 8.95 }, // Lugano (CH) — endpoint buffer
      { lat: 45.92, lng: 8.98 }, // Mendrisio area (~9+ km south)
      { lat: 45.835, lng: 9.032 }, // Chiasso
      { lat: 45.46, lng: 9.19 }, // Milano
    ];
    const detailed = checkRouteConstraintsDetailed(path, [exclusion!]);
    expect(detailed.violations.some((v) => v.severity === "hard")).toBe(true);
  });

  it("does not flag only the departure tip inside the country", () => {
    const exclusion = createCountryExclusion({
      id: "ex-ch",
      label: "Svizzera",
    });
    // Start just inside CH near Chiasso, immediately exit to Italy then Milan
    const path = [
      { lat: 45.84, lng: 9.03 }, // ~Chiasso tip
      { lat: 45.81, lng: 9.08 }, // Italy (~3–4 km)
      { lat: 45.46, lng: 9.19 }, // Milano
    ];
    const detailed = checkRouteConstraintsDetailed(path, [exclusion!]);
    expect(detailed.violations.some((v) => v.severity === "hard")).toBe(false);
  });

  it("createExclusionFromLabel prefers country polygon over place point", () => {
    const ex = createExclusionFromLabel({
      id: "x",
      kind: "city",
      label: "Svizzera",
      place: place("Fake CH place", 47.0, 8.0),
    });
    expect(ex?.kind).toBe("geo_zone");
    expect(ex && "notes" in ex ? ex.notes : "").toMatch(/Esclusione paese/);
  });
});

describe("Maps link without invented waypoints", () => {
  it("opens A→B only when the user added no stops", () => {
    const simple = buildGoogleMapsDirectionsLink({
      origin: place("Lugano", 46.0, 8.95),
      destination: place("Milano", 45.46, 9.19),
      stops: [],
      travelMode: "DRIVE",
      preferences: DEFAULT_ROAD_PREFERENCES,
    });
    expect(simple.url).not.toContain("waypoints=");
    expect(simple.lockedToItineraRoute).toBe(false);
    expect(simple.shapeWaypointCount).toBe(0);
  });

  it("includes only user stops, never invents letters A–H from geometry", () => {
    const withUserStop = buildGoogleMapsDirectionsLink({
      origin: place("Lugano", 46.0, 8.95),
      destination: place("Milano", 45.46, 9.19),
      stops: [place("Como", 45.81, 9.08)],
      travelMode: "DRIVE",
      preferences: DEFAULT_ROAD_PREFERENCES,
    });
    expect(withUserStop.url).toContain("waypoints=");
    expect(withUserStop.shapeWaypointCount).toBe(0);
    expect(withUserStop.preview.stops).toEqual(["Como"]);
  });
});
