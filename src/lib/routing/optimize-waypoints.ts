/**
 * Google Routes API: optimizeWaypointOrder is incompatible with
 * RoutingPreference TRAFFIC_AWARE_OPTIMAL.
 */
export function resolveOptimizeWaypointRouting(params: {
  optimizeWaypointOrder: boolean;
  routingPreference: "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL" | "TRAFFIC_UNAWARE";
  intermediateCount: number;
}): {
  optimizeWaypointOrder: boolean;
  routingPreference: "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL" | "TRAFFIC_UNAWARE";
  limitations: string[];
} {
  const limitations: string[] = [];
  let { optimizeWaypointOrder, routingPreference } = params;

  if (optimizeWaypointOrder && params.intermediateCount < 2) {
    optimizeWaypointOrder = false;
  }

  if (
    optimizeWaypointOrder &&
    routingPreference === "TRAFFIC_AWARE_OPTIMAL"
  ) {
    routingPreference = "TRAFFIC_AWARE";
    limitations.push(
      "Ottimizzazione tappe: Google non supporta TRAFFIC_AWARE_OPTIMAL — calcolo con TRAFFIC_AWARE.",
    );
  }

  return { optimizeWaypointOrder, routingPreference, limitations };
}
