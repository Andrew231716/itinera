"use client";

import { useCallback, useState } from "react";
import { nanoid } from "nanoid";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { speakNavigation } from "@/lib/navigation/voice";
import { remainingStopPlaces } from "@/lib/navigation/waypoints";
import type { PlaceRef } from "@/lib/types/trip";

/**
 * Recalculate from current GPS without leaving the driving session.
 * Keeps exclusions, destination, and *remaining* stops (skips visited ones).
 */
export function useNavRecalculate() {
  const setOrigin = useTripStore((s) => s.setOrigin);
  const setNavigationRecalculating = useTripStore(
    (s) => s.setNavigationRecalculating,
  );
  const recenterNavigation = useTripStore((s) => s.recenterNavigation);
  const { computeRoute } = useRouteCompute();
  const [error, setError] = useState<string | null>(null);

  const recalculateFromHere = useCallback(async () => {
    const nav = useTripStore.getState().navigation;
    const trip = useTripStore.getState().trip;
    if (!nav.position || !trip.destination) {
      setError("Serve posizione GPS e destinazione per ricalcolare.");
      return false;
    }
    if (nav.recalculating) return false;

    setError(null);
    setNavigationRecalculating(true);
    if (nav.voiceEnabled) {
      speakNavigation("Ricalcolo percorso", true);
    }

    const origin: PlaceRef = {
      id: nanoid(),
      label: "Posizione attuale",
      location: { ...nav.position },
      source: "map_click",
    };

    // Drop already-visited intermediate stops so the new route continues the trip.
    const intermediates = remainingStopPlaces(
      trip.stops,
      nav.nextWaypointIndex,
    );

    try {
      setOrigin(origin);
      // Persist trimmed stops so subsequent traffic refreshes match the live trip
      if (intermediates.length !== trip.stops.length) {
        useTripStore.setState((s) => ({
          trip: {
            ...s.trip,
            stops: s.trip.stops.slice(nav.nextWaypointIndex),
            meta: {
              ...s.trip.meta,
              updatedAt: new Date().toISOString(),
            },
          },
        }));
        useTripStore.setState((s) => ({
          navigation: { ...s.navigation, nextWaypointIndex: 0 },
        }));
      }
      await computeRoute({ origin, intermediates });
      const after = useTripStore.getState();
      if (after.routeMode === "error" || after.routes.length === 0) {
        setError(after.routeError ?? "Ricalcolo non riuscito. Riprova.");
        return false;
      }
      recenterNavigation();
      if (after.navigation.voiceEnabled) {
        speakNavigation("Percorso aggiornato", true);
      }
      return true;
    } catch {
      setError("Ricalcolo non riuscito. Riprova.");
      return false;
    } finally {
      setNavigationRecalculating(false);
    }
  }, [
    setOrigin,
    computeRoute,
    setNavigationRecalculating,
    recenterNavigation,
  ]);

  return {
    recalculateFromHere,
    error,
    busy: useTripStore((s) => s.navigation.recalculating),
  };
}
