import type {
  RouteComputeRequest,
  RouteComputeResponse,
} from "@/lib/types/route";
import type { PlaceRef, RoadPreferences } from "@/lib/types/trip";
import {
  buildDemoRouteResponse,
  computeRoutesWithGoogle,
  placeRefFromLatLng,
  remapGoogleRoutesLabels,
} from "@/lib/google/routes-client";
import { rankRoutesByConstraints } from "@/lib/routing/constraint-checker";
import {
  hardPointExclusions,
  offsetLatLng,
} from "@/lib/routing/exclusion-helpers";
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

    let result = await computeRoutesWithGoogle(request, apiKey, preferences);
    result.routes = rankRoutesByConstraints(result.routes);
    result.routes = remapGoogleRoutesLabels(result.routes);

    const hasConformant = result.routes.some((r) => r.isConformant === true);
    if (!hasConformant && request.exclusions.length > 0) {
      const detour = await this.tryDetourAroundExclusions(
        request,
        preferences,
        apiKey,
      );
      if (detour) {
        const merged = rankRoutesByConstraints([
          ...detour.routes,
          ...result.routes,
        ]);
        result = {
          ...result,
          routes: remapGoogleRoutesLabels(merged),
          limitations: [
            ...result.limitations.filter(
              (l) => !l.includes("deviazione automatica"),
            ),
            ...detour.limitations,
            "Ho calcolato anche alternative con deviazione intorno alle zone escluse (Google non ha avoid-area nativi).",
          ],
        };
      }
    }

    const stillNone = result.routes.every((r) => r.isConformant === false);
    if (result.routes.length > 0 && stillNone) {
      result.limitations = [
        ...result.limitations,
        "Nessuna alternativa rispetta tutti i vincoli obbligatori. Riduci il raggio, rimuovi un’esclusione, oppure aggiungi una tappa che forzi la deviazione.",
      ];
    }

    return result;
  }

  /**
   * Google Routes has no avoid_polygons. When every alternative violates hard
   * point exclusions, request a few via-points outside each exclusion circle.
   */
  private async tryDetourAroundExclusions(
    request: RouteComputeRequest,
    preferences: RoadPreferences,
    apiKey: string,
  ): Promise<RouteComputeResponse | null> {
    const points = hardPointExclusions(request.exclusions).slice(0, 2);
    if (points.length === 0) return null;

    const bearings = [0, 90, 180, 270];
    const collected: RouteComputeResponse["routes"] = [];
    const limitations: string[] = [];

    for (const exclusion of points) {
      const center = exclusion.place!.location;
      const distance = Math.max(exclusion.radiusMeters * 1.8, 4000);
      for (const bearing of bearings) {
        if (collected.some((r) => r.isConformant)) break;
        const offset = offsetLatLng(center, bearing, distance);
        const via: PlaceRef = placeRefFromLatLng(
          offset,
          `Deviazione ${exclusion.label}`,
        );
        try {
          const attempt = await computeRoutesWithGoogle(
            {
              ...request,
              intermediates: [...request.intermediates, via],
              optimizeWaypointOrder: false,
            },
            apiKey,
            preferences,
          );
          for (const route of attempt.routes) {
            if (route.isConformant) {
              collected.push({
                ...route,
                label: `Deviazione (evita ${exclusion.label})`,
                engine: "google_routes",
              });
            }
          }
        } catch {
          limitations.push(
            `Deviazione intorno a «${exclusion.label}» non disponibile in questo tentativo.`,
          );
        }
      }
    }

    if (collected.length === 0) return null;
    return {
      mode: "live",
      routes: collected,
      limitations,
    };
  }
}
