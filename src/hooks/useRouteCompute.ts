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
  optimizeWaypointOrder?: boolean;
};

export type ComputeRouteResult = {
  ok: boolean;
  optimizedIntermediateOrder?: number[];
};

/**
 * Computes a route from the trip store (or overrides).
 * Stale overlapping responses are ignored.
 */
export function useRouteCompute() {
  const setRouteLoading = useTripStore((s) => s.setRouteLoading);
  const setRoutesResult = useTripStore((s) => s.setRoutesResult);
  const setRouteError = useTripStore((s) => s.setRouteError);
  const applyOptimizedStopOrder = useTripStore(
    (s) => s.applyOptimizedStopOrder,
  );
  const requestIdRef = useRef(0);

  async function computeRoute(
    overrides?: ComputeOverrides,
  ): Promise<ComputeRouteResult> {
    const trip = useTripStore.getState().trip;
    const origin = overrides?.origin ?? trip.origin;
    const destination = overrides?.destination ?? trip.destination;
    const intermediates =
      overrides?.intermediates ?? trip.stops.map((s) => s.place);
    const optimizeWaypointOrder =
      overrides?.optimizeWaypointOrder ?? trip.optimizeStopOrder;

    if (!origin || !destination) {
      setRouteError("Imposta partenza e destinazione prima di calcolare.");
      return { ok: false };
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
          optimizeWaypointOrder,
          exclusions: trip.exclusions,
        }),
      });
      const data = await res.json();
      if (requestId !== requestIdRef.current) return { ok: false };
      if (!res.ok) {
        setRouteError(data.error ?? "Calcolo percorso non riuscito.");
        return { ok: false };
      }
      const optimized = Array.isArray(data.optimizedIntermediateOrder)
        ? (data.optimizedIntermediateOrder as number[])
        : undefined;
      if (optimized && optimized.length === intermediates.length) {
        applyOptimizedStopOrder(optimized);
      }
      setRoutesResult({
        routes: data.routes ?? [],
        limitations: data.limitations ?? [],
        mode: data.mode === "live" ? "live" : "demo",
      });
      return { ok: true, optimizedIntermediateOrder: optimized };
    } catch (error) {
      if (requestId !== requestIdRef.current) return { ok: false };
      setRouteError(toUserErrorMessage(error));
      return { ok: false };
    }
  }

  return { computeRoute };
}
