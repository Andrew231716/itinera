"use client";

import { useCallback, useState } from "react";
import { nanoid } from "nanoid";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { speakNavigation } from "@/lib/navigation/voice";
import type { PlaceRef } from "@/lib/types/trip";

/**
 * Recalculate from current GPS without leaving the driving session.
 * Keeps exclusions and destination; origin becomes the live fix.
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

    try {
      setOrigin(origin);
      await computeRoute({ origin });
      const after = useTripStore.getState();
      if (after.routeMode === "error" || after.routes.length === 0) {
        setError(after.routeError ?? "Ricalcolo non riuscito. Riprova.");
        return false;
      }
      // Snap camera back and clear off-route feel
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
