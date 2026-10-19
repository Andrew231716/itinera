import { describe, expect, it } from "vitest";
import { resolveOptimizeWaypointRouting } from "@/lib/routing/optimize-waypoints";

describe("resolveOptimizeWaypointRouting", () => {
  it("downgrades TRAFFIC_AWARE_OPTIMAL when optimizing waypoints", () => {
    const r = resolveOptimizeWaypointRouting({
      optimizeWaypointOrder: true,
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      intermediateCount: 3,
    });
    expect(r.optimizeWaypointOrder).toBe(true);
    expect(r.routingPreference).toBe("TRAFFIC_AWARE");
    expect(r.limitations.length).toBeGreaterThan(0);
  });

  it("keeps OPTIMAL when not optimizing", () => {
    const r = resolveOptimizeWaypointRouting({
      optimizeWaypointOrder: false,
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      intermediateCount: 3,
    });
    expect(r.routingPreference).toBe("TRAFFIC_AWARE_OPTIMAL");
    expect(r.limitations).toEqual([]);
  });

  it("disables optimize with fewer than 2 intermediates", () => {
    const r = resolveOptimizeWaypointRouting({
      optimizeWaypointOrder: true,
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      intermediateCount: 1,
    });
    expect(r.optimizeWaypointOrder).toBe(false);
    expect(r.routingPreference).toBe("TRAFFIC_AWARE_OPTIMAL");
  });
});
