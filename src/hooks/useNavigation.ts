"use client";

import { useEffect, useRef } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import { buildManeuvers } from "@/lib/navigation/maneuvers";
import { computeNavProgress } from "@/lib/navigation/progress";
import { buildNavWaypoints } from "@/lib/navigation/waypoints";
import { speakNavigation, stopNavigationSpeech } from "@/lib/navigation/voice";
import {
  watchNavigationPosition,
  type PositionWatcher,
} from "@/lib/navigation/platform";
import { acquireWakeLock, releaseWakeLock } from "@/lib/navigation/wake-lock";
import { useDeviceHeading } from "@/hooks/useDeviceHeading";

/**
 * Watches GPS + compass while navigation is active.
 * Supports multi-stop routes: intermediate arrivals continue the session.
 * Mount once (e.g. AppShell) so the session survives sheet collapse.
 */
export function useNavigation() {
  const navigation = useTripStore((s) => s.navigation);
  const routes = useTripStore((s) => s.routes);
  const selectedRouteId = useTripStore((s) => s.trip.selectedRouteId);
  const updateNavigationFix = useTripStore((s) => s.updateNavigationFix);
  const setNavigationProgress = useTripStore((s) => s.setNavigationProgress);
  const markNavigationSpoken = useTripStore((s) => s.markNavigationSpoken);
  const advancePastWaypoint = useTripStore((s) => s.advancePastWaypoint);
  const setNavigationWakeLock = useTripStore((s) => s.setNavigationWakeLock);
  const setNavigationCompassHeading = useTripStore(
    (s) => s.setNavigationCompassHeading,
  );

  const watcherRef = useRef<PositionWatcher | null>(null);

  const selected =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  const navLive =
    navigation.status === "navigating" ||
    navigation.status === "off_route" ||
    navigation.status === "starting";

  const { requestPermission } = useDeviceHeading(navLive, (headingDeg) => {
    setNavigationCompassHeading(headingDeg);
  });

  // Ask for compass permission once when navigation starts (iOS).
  useEffect(() => {
    if (!navLive) return;
    void requestPermission();
  }, [navLive, requestPermission]);

  useEffect(() => {
    if (!navLive || !selected) {
      watcherRef.current?.clear();
      watcherRef.current = null;
      void releaseWakeLock().then(() => {
        setNavigationWakeLock({ active: false, mode: "inactive" });
      });
      setNavigationCompassHeading(null);
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
          // Ignore very poor fixes when we already have a tighter one
          const prev = useTripStore.getState().navigation;
          if (
            prev.position &&
            prev.accuracyMeters != null &&
            prev.accuracyMeters < 25 &&
            fix.accuracyMeters != null &&
            fix.accuracyMeters > 55
          ) {
            return;
          }
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

          const waypoints = buildNavWaypoints({
            stops: state.trip.stops,
            destination: state.trip.destination,
          });
          const maneuvers = buildManeuvers(route);
          const progress = computeNavProgress({
            position: fix.position,
            route,
            maneuvers,
            waypoints,
            committedWaypointIndex: state.navigation.nextWaypointIndex,
          });
          if (!progress) return;
          setNavigationProgress(progress);

          const nav = useTripStore.getState().navigation;

          // Intermediate stop reached → announce and continue (do not end nav)
          if (
            progress.atIntermediateStop &&
            progress.nextWaypointLabel &&
            progress.nextWaypointKind === "stop"
          ) {
            const arrivedId = `wp-${progress.nextWaypointIndex}-${progress.nextWaypointLabel}`;
            if (arrivedId !== nav.lastArrivedWaypointId) {
              const following =
                waypoints[progress.nextWaypointIndex + 1] ?? null;
              const cue = following
                ? `Tappa raggiunta: ${progress.nextWaypointLabel}. Continua verso ${following.label}`
                : `Tappa raggiunta: ${progress.nextWaypointLabel}`;
              if (nav.voiceEnabled) speakNavigation(cue, true);
              advancePastWaypoint(
                arrivedId,
                progress.nextWaypointIndex + 1,
              );
            }
          }

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
    navLive,
    selected,
    updateNavigationFix,
    setNavigationProgress,
    markNavigationSpoken,
    advancePastWaypoint,
    setNavigationWakeLock,
    setNavigationCompassHeading,
  ]);
}
