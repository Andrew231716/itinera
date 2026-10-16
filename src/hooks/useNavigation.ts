"use client";

import { useEffect, useRef } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import { buildManeuvers } from "@/lib/navigation/maneuvers";
import { computeNavProgress } from "@/lib/navigation/progress";
import { speakNavigation, stopNavigationSpeech } from "@/lib/navigation/voice";
import {
  watchNavigationPosition,
  type PositionWatcher,
} from "@/lib/navigation/platform";
import { acquireWakeLock, releaseWakeLock } from "@/lib/navigation/wake-lock";

/**
 * Watches GPS while navigation is active and updates progress / voice cues.
 * Acquires Screen Wake Lock (or audio fallback) for the session.
 */
export function useNavigation() {
  const navigation = useTripStore((s) => s.navigation);
  const routes = useTripStore((s) => s.routes);
  const selectedRouteId = useTripStore((s) => s.trip.selectedRouteId);
  const updateNavigationFix = useTripStore((s) => s.updateNavigationFix);
  const setNavigationProgress = useTripStore((s) => s.setNavigationProgress);
  const markNavigationSpoken = useTripStore((s) => s.markNavigationSpoken);
  const setNavigationWakeLock = useTripStore((s) => s.setNavigationWakeLock);

  const watcherRef = useRef<PositionWatcher | null>(null);

  const selected =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  useEffect(() => {
    const active =
      navigation.status === "navigating" ||
      navigation.status === "off_route" ||
      navigation.status === "starting";

    if (!active || !selected) {
      watcherRef.current?.clear();
      watcherRef.current = null;
      void releaseWakeLock().then(() => {
        setNavigationWakeLock({ active: false, mode: "inactive" });
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      const wl = await acquireWakeLock();
      if (cancelled) {
        await releaseWakeLock();
        return;
      }
      setNavigationWakeLock({ active: wl.active, mode: wl.mode });

      const watcher = await watchNavigationPosition(
        (fix) => {
          if (cancelled) return;
          updateNavigationFix({
            position: fix.position,
            headingDeg: fix.headingDeg,
            accuracyMeters: fix.accuracyMeters,
            speedMps: fix.speedMps,
          });

          const state = useTripStore.getState();
          const route =
            state.routes.find((r) => r.id === state.trip.selectedRouteId) ??
            state.routes[0];
          if (!route) return;

          const maneuvers = buildManeuvers(route);
          const progress = computeNavProgress({
            position: fix.position,
            route,
            maneuvers,
          });
          if (!progress) return;
          setNavigationProgress(progress);

          const nav = useTripStore.getState().navigation;
          if (
            nav.voiceEnabled &&
            progress.nextManeuver &&
            progress.nextManeuver.id !== nav.lastSpokenManeuverId &&
            progress.metersToNextManeuver < 280
          ) {
            const cue =
              progress.metersToNextManeuver < 40
                ? progress.nextManeuver.instruction
                : `Tra ${Math.round(progress.metersToNextManeuver)} metri: ${progress.nextManeuver.instruction}`;
            speakNavigation(cue, true);
            markNavigationSpoken(progress.nextManeuver.id);
          }

          if (progress.arrived) {
            speakNavigation("Sei arrivato a destinazione", nav.voiceEnabled);
            stopNavigationSpeech();
            useTripStore.setState((s) => ({
              navigation: { ...s.navigation, status: "arrived" },
            }));
          }
        },
        (message, permissionDenied) => {
          if (cancelled) return;
          useTripStore.setState((s) => ({
            navigation: {
              ...s.navigation,
              status: "error",
              error: permissionDenied
                ? "Permesso posizione negato. Abilitalo per navigare."
                : message,
            },
          }));
        },
      );

      if (cancelled) {
        watcher.clear();
        return;
      }
      watcherRef.current = watcher;
    })();

    return () => {
      cancelled = true;
      watcherRef.current?.clear();
      watcherRef.current = null;
      void releaseWakeLock().then(() => {
        setNavigationWakeLock({ active: false, mode: "inactive" });
      });
    };
  }, [
    navigation.status,
    selected,
    updateNavigationFix,
    setNavigationProgress,
    markNavigationSpoken,
    setNavigationWakeLock,
  ]);
}
