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
import type { RoutingEngine } from "./types";

export class GoogleRoutesEngine implements RoutingEngine {
  readonly id = "google_routes";
  readonly displayName = "Google Routes API";
  readonly supportsNativeAvoidAreas = false;
  readonly supportsAlternatives = true;
  readonly supportsWaypoints = true;
  readonly maxIntermediates = 25;

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
      result.routes.every((r) => r.isConformant === false)
    ) {
      result.limitations = [
        ...result.limitations,
        "Nessuna alternativa verificabile rispetta tutti i vincoli obbligatori. Modifica le esclusioni o accetta un percorso con avvisi.",
      ];
    }

    return result;
  }
}
