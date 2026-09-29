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
  hardCountryExclusions,
  hardPointExclusions,
  offsetLatLng,
  switzerlandAvoidViaPoints,
} from "@/lib/routing/exclusion-helpers";
import { getServerGoogleMapsKey } from "@/lib/config/env";
import { enrichComputedRoutesWithMichelin } from "@/lib/michelin/enrich-tolls";
import type { RoutingEngine } from "./types";
import { pointInPolygon } from "@/lib/utils/geometry";

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

    if (result.mode === "live" && result.routes.length > 0) {
      const points = [
        request.origin.location,
        ...request.intermediates.map((p) => p.location),
        request.destination.location,
      ];
      const enriched = await enrichComputedRoutesWithMichelin({
        routes: result.routes,
        points,
        departureName: request.origin.label,
        arrivalName: request.destination.label,
        avoidTolls: preferences.avoidTolls,
        avoidHighways: preferences.avoidHighways,
      });
      result = {
        ...result,
        routes: enriched.routes,
        limitations: enriched.limitation
          ? [...result.limitations, enriched.limitation]
          : result.limitations,
      };
    }

    return result;
  }

  /**
   * Google Routes has no avoid_polygons. When every alternative violates hard
   * exclusions, request via-points that force a corridor outside the zone.
   */
  private async tryDetourAroundExclusions(
    request: RouteComputeRequest,
    preferences: RoadPreferences,
    apiKey: string,
  ): Promise<RouteComputeResponse | null> {
    const collected: RouteComputeResponse["routes"] = [];
    const limitations: string[] = [];

    const countryRoutes = await this.tryCountryDetours(
      request,
      preferences,
      apiKey,
      limitations,
    );
    collected.push(...countryRoutes);

    const points = hardPointExclusions(request.exclusions).slice(0, 2);
    const bearings = [0, 90, 180, 270];

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

  /** Force Italian corridor vias when avoiding Switzerland (geo_zone paese). */
  private async tryCountryDetours(
    request: RouteComputeRequest,
    preferences: RoadPreferences,
    apiKey: string,
    limitations: string[],
  ): Promise<RouteComputeResponse["routes"]> {
    const countries = hardCountryExclusions(request.exclusions);
    if (countries.length === 0) return [];

    const collected: RouteComputeResponse["routes"] = [];
    const swiss = countries.find((c) => /svizzera/i.test(c.label));
    const viaCandidates = swiss
      ? switzerlandAvoidViaPoints().filter(
          (v) => !pointInPolygon(v.location, swiss.polygon),
        )
      : [];

    for (const via of viaCandidates) {
      if (collected.some((r) => r.isConformant)) break;
      // Skip vias that are essentially the origin/destination
      const nearOd =
        Math.hypot(
          via.location.lat - request.origin.location.lat,
          via.location.lng - request.origin.location.lng,
        ) < 0.05 ||
        Math.hypot(
          via.location.lat - request.destination.location.lat,
          via.location.lng - request.destination.location.lng,
        ) < 0.05;
      if (nearOd) continue;

      try {
        const attempt = await computeRoutesWithGoogle(
          {
            ...request,
            intermediates: [
              ...request.intermediates,
              placeRefFromLatLng(via.location, via.label),
            ],
            optimizeWaypointOrder: false,
          },
          apiKey,
          preferences,
        );
        for (const route of attempt.routes) {
          if (route.isConformant) {
            collected.push({
              ...route,
              label: `Deviazione via ${via.label}`,
              engine: "google_routes",
            });
          }
        }
      } catch {
        limitations.push(
          `Deviazione via «${via.label}» non disponibile in questo tentativo.`,
        );
      }
    }

    return collected;
  }
}
