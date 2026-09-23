import type {
  RouteComputeRequest,
  RouteComputeResponse,
} from "@/lib/types/route";
import type { RoadPreferences } from "@/lib/types/trip";
import type { RoutingEngine } from "./types";

/**
 * Adapter stub for OpenRouteService (or similar).
 *
 * Evaluation summary (not activated):
 * - OpenRouteService: good avoid_polygons support; free tier limits; AGPL-ish
 *   considerations for self-host; commercial cloud available.
 * - GraphHopper: route optimization + custom models; commercial license for many uses.
 * - OSRM: excellent performance, limited native avoid-area semantics without custom
 *   profiles; BSD license for self-host.
 *
 * This adapter NEVER pretends to return live routes. It documents capability
 * and returns an explicit unavailable response until OPENROUTESERVICE_API_KEY
 * is configured AND integration is completed.
 */
export class OpenRouteServiceEngine implements RoutingEngine {
  readonly id = "openrouteservice";
  readonly displayName = "OpenRouteService (adapter predisposto)";
  readonly supportsNativeAvoidAreas = true;
  readonly supportsAlternatives = true;
  readonly supportsWaypoints = true;
  readonly maxIntermediates = 50;

  async compute(
    _request: RouteComputeRequest,
    _preferences: RoadPreferences,
  ): Promise<RouteComputeResponse> {
    void _request;
    void _preferences;
    const key = process.env.OPENROUTESERVICE_API_KEY?.trim();
    if (!key) {
      return {
        mode: "demo",
        routes: [],
        engineId: this.id,
        limitations: [
          "Motore OpenRouteService predisposto ma non attivo (manca OPENROUTESERVICE_API_KEY o integrazione completa).",
          "ORS è candidato per avoid_polygons nativi sulle esclusioni hard che Google non forza.",
          "Nessun percorso inventato da questo adapter.",
        ],
      };
    }

    // Key present but full ORS mapping not shipped yet — do not fake results.
    return {
      mode: "demo",
      routes: [],
      engineId: this.id,
      limitations: [
        "OPENROUTESERVICE_API_KEY rilevata, ma l’adattatore completo non è ancora implementato.",
        "Nessun percorso ORS viene simulato. Usa Google Routes come motore primario.",
      ],
    };
  }
}
