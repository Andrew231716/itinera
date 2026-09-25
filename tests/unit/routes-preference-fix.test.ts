import { describe, expect, it } from "vitest";
import { mapPreferencesToGoogle } from "@/lib/routing/preference-mapper";
import { normalizeRoutePlaceId } from "@/lib/google/routes-client";
import { DEFAULT_ROAD_PREFERENCES } from "@/lib/types/trip";

describe("mapPreferencesToGoogle", () => {
  it("never sends FUEL_EFFICIENT as routingPreference", () => {
    const mapped = mapPreferencesToGoogle({
      ...DEFAULT_ROAD_PREFERENCES,
      preferFastest: false,
      preferShortest: true,
    });
    expect(mapped.routingPreference).toBe("TRAFFIC_AWARE_OPTIMAL");
    expect(mapped.requestedReferenceRoutes).toEqual(["FUEL_EFFICIENT"]);
  });

  it("keeps traffic-aware optimal for fastest", () => {
    const mapped = mapPreferencesToGoogle({
      ...DEFAULT_ROAD_PREFERENCES,
      preferFastest: true,
      preferShortest: false,
    });
    expect(mapped.routingPreference).toBe("TRAFFIC_AWARE_OPTIMAL");
    expect(mapped.requestedReferenceRoutes).toBeUndefined();
  });

  it("requests eco reference when both fastest and shortest are on", () => {
    const mapped = mapPreferencesToGoogle({
      ...DEFAULT_ROAD_PREFERENCES,
      preferFastest: true,
      preferShortest: true,
    });
    expect(mapped.routingPreference).toBe("TRAFFIC_AWARE_OPTIMAL");
    expect(mapped.requestedReferenceRoutes).toEqual(["FUEL_EFFICIENT"]);
  });
});

describe("normalizeRoutePlaceId", () => {
  it("strips places/ prefix", () => {
    expect(normalizeRoutePlaceId("places/ChIJabc1234567890")).toBe(
      "ChIJabc1234567890",
    );
  });

  it("rejects demo ids", () => {
    expect(normalizeRoutePlaceId("demo-milano")).toBeUndefined();
  });
});
