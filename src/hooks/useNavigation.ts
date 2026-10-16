"use client";

import { useEffect, useRef } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import { buildManeuvers } from "@/lib/navigation/maneuvers";
import { computeNavProgress } from "@/lib/navigation/progress";
import { speakNavigation, stopNavigationSpeech } from "@/lib/navigation/voice";

/**
 * Watches GPS while navigation is active and updates progress / voice cues.
 */
export function useNavigation() {
  const navigation = useTripStore((s) => s.navigation);
  const routes = useTripStore((s) => s.routes);
  const selectedRouteId = useTripStore((s) => s.trip.selectedRouteId);
  const updateNavigationFix = useTripStore((s) => s.updateNavigationFix);
  const setNavigationProgress = useTripStore((s) => s.setNavigationProgress);
  const markNavigationSpoken = useTripStore((s) => s.markNavigationSpoken);

  const watchIdRef = useRef<number | null>(null);

  const selected =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  useEffect(() => {
    const active =
      navigation.status === "navigating" ||
      navigation.status === "off_route" ||
      navigation.status === "starting";

    if (!active || !selected) {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      useTripStore.setState((s) => ({
        navigation: {
          ...s.navigation,
          status: "error",
          error: "Geolocalizzazione non disponibile su questo dispositivo.",
        },
      }));
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        updateNavigationFix({
          position,
          headingDeg:
            pos.coords.heading != null && Number.isFinite(pos.coords.heading)
              ? pos.coords.heading
              : null,
          accuracyMeters: pos.coords.accuracy,
          speedMps:
            pos.coords.speed != null && Number.isFinite(pos.coords.speed)
              ? pos.coords.speed
              : null,
        });

        const route =
          useTripStore.getState().routes.find(
            (r) => r.id === useTripStore.getState().trip.selectedRouteId,
          ) ?? useTripStore.getState().routes[0];
        if (!route) return;

        const maneuvers = buildManeuvers(route);
        const progress = computeNavProgress({
          position,
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
      (err) => {
        useTripStore.setState((s) => ({
          navigation: {
            ...s.navigation,
            status: "error",
            error:
              err.code === err.PERMISSION_DENIED
                ? "Permesso posizione negato. Abilitalo per navigare."
                : "Impossibile ottenere la posizione GPS.",
          },
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [
    navigation.status,
    selected,
    updateNavigationFix,
    setNavigationProgress,
    markNavigationSpoken,
  ]);
}
