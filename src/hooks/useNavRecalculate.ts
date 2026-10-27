"use client";

import { useCallback, useState } from "react";
import { nanoid } from "nanoid";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { speakNavigation } from "@/lib/navigation/voice";
import { remainingStopPlaces } from "@/lib/navigation/waypoints";
import type { PlaceRef, TripStop } from "@/lib/types/trip";

/**
 * Recalculate from current GPS without leaving the driving session.
 * Keeps exclusions, destination, and *remaining* stops (skips visited ones).
 * Mutates trip only after a successful compute (rollback on failure).
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

    const intermediates = remainingStopPlaces(
      trip.stops,
      nav.nextWaypointIndex,
    );
    const prevOrigin = trip.origin;
    const prevStops: TripStop[] = trip.stops;
    const prevWaypointIndex = nav.nextWaypointIndex;

    try {
      // Compute first with overrides — do not mutate trip until success
      const result = await computeRoute({ origin, intermediates });
      const after = useTripStore.getState();
      if (!result.ok || after.routes.length === 0) {
        setError(after.routeError ?? "Ricalcolo non riuscito. Riprova.");
        return false;
      }

      setOrigin(origin);
      if (intermediates.length !== prevStops.length) {
        useTripStore.setState((s) => ({
          trip: {
            ...s.trip,
            stops: prevStops.slice(prevWaypointIndex),
            meta: {
              ...s.trip.meta,
              updatedAt: new Date().toISOString(),
            },
          },
          navigation: { ...s.navigation, nextWaypointIndex: 0 },
        }));
      }
      recenterNavigation();
      if (after.navigation.voiceEnabled) {
        speakNavigation("Percorso aggiornato", true);
      }
      return true;
    } catch {
      // Restore prior OD if we somehow mutated (we don't until success)
      useTripStore.setState((s) => ({
        trip: {
          ...s.trip,
          origin: prevOrigin,
          stops: prevStops,
        },
        navigation: {
          ...s.navigation,
          nextWaypointIndex: prevWaypointIndex,
        },
      }));
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
