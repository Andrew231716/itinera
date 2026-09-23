"use client";

import { useTripStore } from "@/lib/store/trip-store";
import { toUserErrorMessage } from "@/lib/utils/errors";

export function useRouteCompute() {
  const trip = useTripStore((s) => s.trip);
  const setRouteLoading = useTripStore((s) => s.setRouteLoading);
  const setRoutesResult = useTripStore((s) => s.setRoutesResult);
  const setRouteError = useTripStore((s) => s.setRouteError);

  async function computeRoute() {
    if (!trip.origin || !trip.destination) {
      setRouteError("Imposta partenza e destinazione prima di calcolare.");
      return;
    }

    setRouteLoading();
    try {
      const res = await fetch("/api/routes/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: trip.origin,
          destination: trip.destination,
          intermediates: trip.stops.map((s) => s.place),
          travelMode: trip.travelMode,
          departureAt: trip.departureAt,
          preferences: trip.preferences,
          optimizeWaypointOrder: trip.optimizeStopOrder,
          exclusions: trip.exclusions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRouteError(data.error ?? "Calcolo percorso non riuscito.");
        return;
      }
      setRoutesResult({
        routes: data.routes ?? [],
        limitations: data.limitations ?? [],
        mode: data.mode === "live" ? "live" : "demo",
      });
    } catch (error) {
      setRouteError(toUserErrorMessage(error));
    }
  }

  return { computeRoute };
}
