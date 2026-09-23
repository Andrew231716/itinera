import type {
  RouteComputeRequest,
  RouteComputeResponse,
} from "@/lib/types/route";
import type { RoadPreferences } from "@/lib/types/trip";
import {
  buildDemoRouteResponse,
  computeRoutesWithGoogle,
} from "@/lib/google/routes-client";
import { rankRoutesByConstraints } from "@/lib/routing/constraint-checker";
import { getServerGoogleMapsKey } from "@/lib/config/env";

/**
 * Routing engine abstraction.
 * Today: Google Routes (+ post-check for custom exclusions).
 * Future: alternative engines can plug in for hard constraints Google cannot enforce.
 */
export interface RoutingEngine {
  readonly id: string;
  readonly supportsNativeAvoidAreas: boolean;
  compute(
    request: RouteComputeRequest,
    preferences: RoadPreferences,
  ): Promise<RouteComputeResponse>;
}

export class GoogleRoutesEngine implements RoutingEngine {
  readonly id = "google_routes";
  readonly supportsNativeAvoidAreas = false;

  async compute(
    request: RouteComputeRequest,
    preferences: RoadPreferences,
  ): Promise<RouteComputeResponse> {
    const apiKey = getServerGoogleMapsKey();
    if (!apiKey) {
      return buildDemoRouteResponse(request);
    }

    const result = await computeRoutesWithGoogle(
      request,
      apiKey,
      preferences,
    );

    result.routes = rankRoutesByConstraints(result.routes);

    if (
      result.routes.length > 0 &&
      result.routes.every((r) =>
        r.violations.some((v) => v.severity === "hard"),
      )
    ) {
      result.limitations = [
        ...result.limitations,
        "Nessuna alternativa verificabile rispetta tutti i vincoli obbligatori. Modifica le esclusioni o accetta un percorso con avvisi.",
      ];
    }

    return result;
  }
}

export function getDefaultRoutingEngine(): RoutingEngine {
  return new GoogleRoutesEngine();
}
