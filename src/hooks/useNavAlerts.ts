"use client";

import { useEffect, useRef } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import {
  EMPTY_ALERT_SNAPSHOT,
  findNextAlertAhead,
  pickSpeedLimitNear,
  voiceCueForAlert,
  type NavAlert,
  type NavAlertSnapshot,
} from "@/lib/navigation/alerts";
import { speakNavigation } from "@/lib/navigation/voice";
import type { LatLng } from "@/lib/types/trip";

type AlertsApiResponse = {
  alerts?: NavAlert[];
  speedLimitSamples?: Array<{ location: LatLng; maxspeedKmh: number }>;
  source?: "osm" | "none";
  attribution?: string;
};

/**
 * Loads OSM alerts along the active route and updates live speed-limit /
 * next-alert fields while navigating.
 */
export function useNavAlerts() {
  const navigationStatus = useTripStore((s) => s.navigation.status);
  const selectedRouteId = useTripStore((s) => s.trip.selectedRouteId);
  const routePathLen = useTripStore((s) => {
    const r =
      s.routes.find((x) => x.id === s.trip.selectedRouteId) ?? s.routes[0];
    return r?.decodedPath.length ?? 0;
  });
  const routeDistance = useTripStore((s) => {
    const r =
      s.routes.find((x) => x.id === s.trip.selectedRouteId) ?? s.routes[0];
    return r ? Math.round(r.distanceMeters) : 0;
  });
  const setNavigationAlerts = useTripStore((s) => s.setNavigationAlerts);
  const markAlertSpoken = useTripStore((s) => s.markNavigationAlertSpoken);

  const navLive =
    navigationStatus === "navigating" ||
    navigationStatus === "off_route" ||
    navigationStatus === "starting";

  const samplesRef = useRef<
    Array<{ location: LatLng; maxspeedKmh: number }>
  >([]);
  const alertsRef = useRef<NavAlert[]>([]);
  const metaRef = useRef({
    fetchedAt: null as string | null,
    source: "none" as "osm" | "none",
    attribution: "© OpenStreetMap contributors",
  });
  const routeKeyRef = useRef<string | null>(null);
  const spokenRef = useRef<Set<string>>(new Set());

  // Stable deps (id/length/distance) so traffic refreshes don't abort the fetch
  useEffect(() => {
    if (!navLive || !selectedRouteId || routePathLen < 2) {
      if (!navLive) {
        setNavigationAlerts(EMPTY_ALERT_SNAPSHOT);
        samplesRef.current = [];
        alertsRef.current = [];
        routeKeyRef.current = null;
        spokenRef.current = new Set();
      }
      return;
    }

    const key = `${selectedRouteId}:${routePathLen}:${routeDistance}`;
    if (routeKeyRef.current === key && metaRef.current.fetchedAt) return;
    routeKeyRef.current = key;
    spokenRef.current = new Set();

    const path =
      useTripStore.getState().routes.find((r) => r.id === selectedRouteId)
        ?.decodedPath ??
      useTripStore.getState().routes[0]?.decodedPath ??
      [];
    if (path.length < 2) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/nav/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const data = (await res.json()) as AlertsApiResponse;
        if (cancelled || routeKeyRef.current !== key) return;
        samplesRef.current = data.speedLimitSamples ?? [];
        alertsRef.current = data.alerts ?? [];
        metaRef.current = {
          fetchedAt: new Date().toISOString(),
          source: data.source === "osm" ? "osm" : "none",
          attribution:
            data.attribution ?? "© OpenStreetMap contributors",
        };
        setNavigationAlerts({
          alerts: alertsRef.current,
          speedLimitKmh: null,
          nextAlert: null,
          metersToNextAlert: null,
          ...metaRef.current,
        });
      } catch {
        if (!cancelled && routeKeyRef.current === key) {
          setNavigationAlerts({
            ...EMPTY_ALERT_SNAPSHOT,
            fetchedAt: new Date().toISOString(),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    navLive,
    selectedRouteId,
    routePathLen,
    routeDistance,
    setNavigationAlerts,
  ]);

  const traveledMeters = useTripStore(
    (s) => s.navigation.progress?.traveledMeters ?? null,
  );
  const posLat = useTripStore((s) => s.navigation.position?.lat ?? null);
  const posLng = useTripStore((s) => s.navigation.position?.lng ?? null);
  const voiceEnabled = useTripStore((s) => s.navigation.voiceEnabled);

  useEffect(() => {
    if (!navLive || traveledMeters == null || posLat == null || posLng == null) {
      return;
    }
    const position = { lat: posLat, lng: posLng };
    const speedLimitKmh = pickSpeedLimitNear(
      position,
      samplesRef.current,
      55,
    );
    const next = findNextAlertAhead(
      alertsRef.current,
      traveledMeters,
      1500,
    );
    const metersRounded =
      next != null ? Math.round(next.metersAhead) : null;

    const prev = useTripStore.getState().navigation.alerts;
    const same =
      prev.speedLimitKmh === speedLimitKmh &&
      prev.nextAlert?.id === (next?.alert.id ?? null) &&
      Math.round(prev.metersToNextAlert ?? -1) === (metersRounded ?? -1);
    if (!same) {
      const snapshot: NavAlertSnapshot = {
        alerts: alertsRef.current,
        speedLimitKmh,
        nextAlert: next?.alert ?? null,
        metersToNextAlert: next?.metersAhead ?? null,
        fetchedAt: metaRef.current.fetchedAt,
        source: metaRef.current.source,
        attribution: metaRef.current.attribution,
      };
      setNavigationAlerts(snapshot);
    }

    if (
      voiceEnabled &&
      next &&
      next.metersAhead < 500 &&
      !spokenRef.current.has(next.alert.id)
    ) {
      spokenRef.current.add(next.alert.id);
      markAlertSpoken(next.alert.id);
      speakNavigation(voiceCueForAlert(next.alert, next.metersAhead), true);
    }
  }, [
    navLive,
    traveledMeters,
    posLat,
    posLng,
    voiceEnabled,
    setNavigationAlerts,
    markAlertSpoken,
  ]);
}
