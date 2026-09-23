import type {
  RouteComputeRequest,
  RouteComputeResponse,
} from "@/lib/types/route";
import type { RoadPreferences } from "@/lib/types/trip";
import { GoogleRoutesEngine } from "./google-routes-engine";
import { OpenRouteServiceEngine } from "./openrouteservice-engine";

/**
 * Common routing engine contract.
 * Engines must never invent distances/paths when unavailable.
 */
export interface RoutingEngine {
  readonly id: string;
  readonly displayName: string;
  readonly supportsNativeAvoidAreas: boolean;
  readonly supportsAlternatives: boolean;
  readonly supportsWaypoints: boolean;
  readonly maxIntermediates: number;
  compute(
    request: RouteComputeRequest,
    preferences: RoadPreferences,
  ): Promise<RouteComputeResponse>;
}

export function listRoutingEngines(): RoutingEngine[] {
  return [new GoogleRoutesEngine(), new OpenRouteServiceEngine()];
}

export function getRoutingEngine(id?: string): RoutingEngine {
  const engines = listRoutingEngines();
  if (id) {
    const found = engines.find((e) => e.id === id);
    if (found) return found;
  }
  return new GoogleRoutesEngine();
}

export function getDefaultRoutingEngine(): RoutingEngine {
  return getRoutingEngine(process.env.ROUTING_ENGINE?.trim() || "google_routes");
}

export type {
  RouteComputeRequest,
  RouteComputeResponse,
} from "@/lib/types/route";
