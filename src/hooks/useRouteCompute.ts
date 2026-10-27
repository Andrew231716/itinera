"use client";

import { useRef } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import { toUserErrorMessage } from "@/lib/utils/errors";
import type { PlaceRef } from "@/lib/types/trip";

type ComputeOverrides = {
  origin?: PlaceRef;
  destination?: PlaceRef;
  /** Remaining intermediate stops (defaults to all trip.stops) */
  intermediates?: PlaceRef[];
};

/**
 * Computes a route from the trip store (or overrides).
 * Returns false on failure. Stale overlapping responses are ignored.
 */
export function useRouteCompute() {
  const setRouteLoading = useTripStore((s) => s.setRouteLoading);
  const setRoutesResult = useTripStore((s) => s.setRoutesResult);
  const setRouteError = useTripStore((s) => s.setRouteError);
  const requestIdRef = useRef(0);

  async function computeRoute(
    overrides?: ComputeOverrides,
  ): Promise<boolean> {
    const trip = useTripStore.getState().trip;
    const origin = overrides?.origin ?? trip.origin;
    const destination = overrides?.destination ?? trip.destination;
    const intermediates =
      overrides?.intermediates ?? trip.stops.map((s) => s.place);

    if (!origin || !destination) {
      setRouteError("Imposta partenza e destinazione prima di calcolare.");
      return false;
    }

    const requestId = ++requestIdRef.current;
    setRouteLoading();
    try {
      const res = await fetch("/api/routes/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination,
          intermediates,
          travelMode: trip.travelMode,
          departureAt: trip.departureAt,
          preferences: trip.preferences,
          optimizeWaypointOrder: trip.optimizeStopOrder,
          exclusions: trip.exclusions,
        }),
      });
      const data = await res.json();
      if (requestId !== requestIdRef.current) return false;
      if (!res.ok) {
        setRouteError(data.error ?? "Calcolo percorso non riuscito.");
        return false;
      }
      setRoutesResult({
        routes: data.routes ?? [],
        limitations: data.limitations ?? [],
        mode: data.mode === "live" ? "live" : "demo",
      });
      return true;
    } catch (error) {
      if (requestId !== requestIdRef.current) return false;
      setRouteError(toUserErrorMessage(error));
      return false;
    }
  }

  return { computeRoute };
}
