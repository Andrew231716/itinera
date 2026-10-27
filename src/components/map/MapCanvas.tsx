"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import type { LatLng } from "@/lib/types/trip";
import { boundsFromPoints } from "@/lib/utils/geometry";
import { destinationPoint } from "@/lib/navigation/destination-point";
import { effectiveNavHeading } from "@/lib/navigation/effective-heading";
import {
  lerpHeading,
  lerpLatLng,
  NAV_CHEVRON_PATH,
} from "@/lib/navigation/smooth";
import { useTheme } from "@/hooks/useTheme";

declare global {
  interface Window {
    google?: typeof google;
    __itineraMapsLoading?: Promise<void>;
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__itineraMapsLoading) return window.__itineraMapsLoading;

  window.__itineraMapsLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=it`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Impossibile caricare Google Maps JavaScript API."));
    document.head.appendChild(script);
  });

  return window.__itineraMapsLoading;
}

function collectFocusPoints(): LatLng[] {
  const {
    trip,
    routes,
    exclusionDraftPoints,
    parkingSpots,
    selectedParkingId,
    fuelStations,
    selectedFuelId,
  } = useTripStore.getState();
  const points: LatLng[] = [];
  if (trip.origin) points.push(trip.origin.location);
  if (trip.destination) points.push(trip.destination.location);
  trip.stops.forEach((s) => points.push(s.place.location));
  trip.exclusions.forEach((ex) => {
    if (ex.kind === "geo_zone") points.push(...ex.polygon);
    else if (ex.kind === "road_segment") points.push(...ex.path);
    else if (ex.place) points.push(ex.place.location);
  });
  const selected =
    routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0];
  if (selected?.decodedPath.length) points.push(...selected.decodedPath);
  points.push(...exclusionDraftPoints);
  const selectedParking = parkingSpots.find((p) => p.id === selectedParkingId);
  if (selectedParking) points.push(selectedParking.location);
  else parkingSpots.slice(0, 12).forEach((p) => points.push(p.location));
  const selectedFuel = fuelStations.find((f) => f.id === selectedFuelId);
  if (selectedFuel) points.push(selectedFuel.location);
  else fuelStations.slice(0, 12).forEach((f) => points.push(f.location));
  return points;
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const navMarkerRef = useRef<google.maps.Marker | null>(null);
  const accuracyRef = useRef<google.maps.Circle | null>(null);
  const animRef = useRef<number | null>(null);
  const displayPosRef = useRef<LatLng | null>(null);
  const displayHeadingRef = useRef<number>(0);
  const targetPosRef = useRef<LatLng | null>(null);
  const targetHeadingRef = useRef<number>(0);

  const { theme } = useTheme();
  const browserMapsKey = useTripStore((s) => s.browserMapsKey);
  const mapsMapId = useTripStore((s) => s.mapsMapId);
  const mapsMode = useTripStore((s) => s.mapsMode);
  const trip = useTripStore((s) => s.trip);
  const routes = useTripStore((s) => s.routes);
  const exclusionDraftPoints = useTripStore((s) => s.exclusionDraftPoints);
  const mapPickTarget = useTripStore((s) => s.mapPickTarget);
  const handleMapClick = useTripStore((s) => s.handleMapClick);
  const parkingSpots = useTripStore((s) => s.parkingSpots);
  const selectedParkingId = useTripStore((s) => s.selectedParkingId);
  const selectParking = useTripStore((s) => s.selectParking);
  const fuelStations = useTripStore((s) => s.fuelStations);
  const selectedFuelId = useTripStore((s) => s.selectedFuelId);
  const selectFuel = useTripStore((s) => s.selectFuel);
  const navigation = useTripStore((s) => s.navigation);
  const setNavigationFollowMap = useTripStore((s) => s.setNavigationFollowMap);
  const setNavigationOverview = useTripStore((s) => s.setNavigationOverview);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isVector, setIsVector] = useState(false);

  const navActive =
    navigation.status === "navigating" ||
    navigation.status === "off_route" ||
    navigation.status === "starting" ||
    navigation.status === "arrived";

  // Init / recreate map when key, mapId, or theme changes
  useEffect(() => {
    if (!browserMapsKey || !containerRef.current) return;
    let cancelled = false;
    let renderingListener: google.maps.MapsEventListener | null = null;
    setReady(false);

    // Clear previous overlays/marker when recreating
    navMarkerRef.current?.setMap(null);
    navMarkerRef.current = null;
    accuracyRef.current?.setMap(null);
    accuracyRef.current = null;
    overlaysRef.current.forEach((o) => {
      if ("setMap" in o) {
        (o as google.maps.Marker).setMap(null);
      }
    });
    overlaysRef.current = [];
    mapRef.current = null;

    loadGoogleMaps(browserMapsKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        const gmaps = window.google.maps;
        const opts: google.maps.MapOptions = {
          center: { lat: 42.5, lng: 12.5 },
          zoom: 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          rotateControl: false,
          tilt: 0,
          heading: 0,
          renderingType: gmaps.RenderingType?.VECTOR ?? "VECTOR",
          mapId: mapsMapId || gmaps.Map.DEMO_MAP_ID,
          colorScheme:
            theme === "dark"
              ? gmaps.ColorScheme?.DARK ?? "DARK"
              : gmaps.ColorScheme?.LIGHT ?? "LIGHT",
        };
        mapRef.current = new gmaps.Map(containerRef.current, opts);
        const map = mapRef.current;
        const syncVector = () => {
          const type = String(map.getRenderingType?.() ?? "");
          setIsVector(type === "VECTOR");
        };
        syncVector();
        renderingListener = map.addListener("renderingtype_changed", syncVector);
        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
      renderingListener?.remove();
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [browserMapsKey, mapsMapId, theme]);

  // Pan / drag unlocks follow so the recenter button appears
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.google?.maps) return;
    const onDragStart = () => {
      const nav = useTripStore.getState().navigation;
      if (
        nav.status === "navigating" ||
        nav.status === "off_route" ||
        nav.status === "starting"
      ) {
        setNavigationFollowMap(false);
        setNavigationOverview(false);
      }
    };
    const drag = map.addListener("dragstart", onDragStart);
    return () => {
      drag.remove();
    };
  }, [ready, setNavigationFollowMap, setNavigationOverview]);

  // Overview: fit remaining route + position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !navigation.overview || !navActive) return;
    const selected =
      routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0];
    const pts: LatLng[] = [];
    if (navigation.position) pts.push(navigation.position);
    if (selected?.decodedPath?.length) {
      const startIdx = Math.max(0, navigation.progress?.segmentIndex ?? 0);
      pts.push(...selected.decodedPath.slice(startIdx));
    } else if (trip.destination) {
      pts.push(trip.destination.location);
    }
    if (pts.length < 2) return;
    const b = boundsFromPoints(pts);
    if (!b) return;
    map.fitBounds(
      new google.maps.LatLngBounds(
        { lat: b.south, lng: b.west },
        { lat: b.north, lng: b.east },
      ),
      64,
    );
    try {
      map.setTilt(0);
      map.setHeading(0);
    } catch {
      // ignore
    }
  }, [
    ready,
    navigation.overview,
    navigation.position,
    navigation.progress?.segmentIndex,
    navActive,
    routes,
    trip.selectedRouteId,
    trip.destination,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      handleMapClick(e.latLng.lat(), e.latLng.lng());
    });

    return () => {
      listener.remove();
    };
  }, [handleMapClick, ready]);

  // Static overlays (route, stops, parking…) — NOT every GPS tick
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !ready) return;

    overlaysRef.current.forEach((o) => {
      if ("setMap" in o) {
        (o as google.maps.Marker | google.maps.Polyline | google.maps.Polygon).setMap(
          null,
        );
      }
    });
    overlaysRef.current = [];

    const addMarker = (
      position: LatLng,
      label: string,
      color: string,
      onClick?: () => void,
    ) => {
      const marker = new window.google!.maps.Marker({
        map,
        position,
        label: {
          text: label,
          color: "#fff",
          fontSize: "11px",
          fontWeight: "700",
        },
        icon: {
          path: window.google!.maps.SymbolPath.CIRCLE,
          scale: onClick ? 11 : 12,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        zIndex: onClick ? 50 : 10,
      });
      if (onClick) marker.addListener("click", onClick);
      overlaysRef.current.push(marker);
    };

    if (trip.origin) addMarker(trip.origin.location, "A", "#2C5F7C");
    trip.stops.forEach((s, i) => {
      const isNext =
        navActive &&
        navigation.nextWaypointIndex === i &&
        navigation.status !== "arrived";
      addMarker(
        s.place.location,
        String(i + 1),
        isNext ? "#0D9488" : "#4A7C8C",
      );
    });
    if (trip.destination) {
      const destIsNext =
        navActive &&
        navigation.nextWaypointIndex >= trip.stops.length &&
        navigation.status !== "arrived";
      addMarker(
        trip.destination.location,
        "B",
        destIsNext ? "#0D9488" : "#D4A017",
      );
    }

    if (!navActive) {
      parkingSpots.slice(0, 24).forEach((spot, index) => {
        const selected = spot.id === selectedParkingId;
        addMarker(
          spot.location,
          selected ? "P" : String(index + 1),
          selected
            ? "#0F766E"
            : spot.pricing === "free"
              ? "#15803D"
              : spot.pricing === "paid"
                ? "#B45309"
                : "#64748B",
          () => {
            selectParking(spot.id);
            setActivePanel("parking");
            setMobilePanelOpen(true);
          },
        );
      });

      fuelStations.slice(0, 24).forEach((station, index) => {
        const selected = station.id === selectedFuelId;
        addMarker(
          station.location,
          selected ? "F" : String(index + 1),
          selected
            ? "#1D4ED8"
            : station.amenities.adblue === "yes"
              ? "#2563EB"
              : "#475569",
          () => {
            selectFuel(station.id);
            setActivePanel("fuel");
            setMobilePanelOpen(true);
          },
        );
      });
    }

    const selected =
      routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0];
    if (selected?.decodedPath.length) {
      const poly = new window.google.maps.Polyline({
        map,
        path: selected.decodedPath,
        strokeColor: theme === "dark" ? "#7eb6d4" : "#2C5F7C",
        strokeOpacity: navActive ? 0.28 : 0.9,
        strokeWeight: navActive ? 6 : 5,
      });
      overlaysRef.current.push(poly);

      if (navActive && navigation.progress) {
        const from = Math.max(0, navigation.progress.segmentIndex);
        const remaining = [
          navigation.progress.snapped,
          ...selected.decodedPath.slice(from + 1),
        ];
        if (remaining.length >= 2) {
          const off = navigation.status === "off_route";
          // Dark underlay for contrast, then bright direction strip
          const underlay = new window.google.maps.Polyline({
            map,
            path: remaining,
            strokeColor: off ? "#7F1D1D" : "#064E3B",
            strokeOpacity: 0.85,
            strokeWeight: 16,
            zIndex: 2,
          });
          overlaysRef.current.push(underlay);
          const remainPoly = new window.google.maps.Polyline({
            map,
            path: remaining,
            strokeColor: off ? "#F87171" : "#22C55E",
            strokeOpacity: 1,
            strokeWeight: 12,
            zIndex: 3,
          });
          overlaysRef.current.push(remainPoly);
        }

        // Road alerts (cameras, works) near the route
        const traveled = navigation.progress?.traveledMeters ?? 0;
        navigation.alerts?.alerts?.slice(0, 40).forEach((alert) => {
          if (alert.kind === "speed_limit") return;
          const offset = alert.routeOffsetMeters;
          if (offset != null && offset < traveled - 80) return;
          const color =
            alert.kind === "roadworks"
              ? "#EA580C"
              : alert.kind === "traffic_light_camera"
                ? "#7C3AED"
                : "#DC2626";
          const glyph =
            alert.kind === "roadworks"
              ? "W"
              : alert.kind === "traffic_light_camera"
                ? "S"
                : "A";
          addMarker(alert.location, glyph, color);
        });
      }
    }

    trip.exclusions.forEach((ex) => {
      if (ex.kind === "geo_zone" && ex.polygon.length >= 3) {
        const polygon = new window.google!.maps.Polygon({
          map,
          paths: ex.polygon,
          fillColor: "#C23B22",
          fillOpacity: 0.18,
          strokeColor: "#C23B22",
          strokeWeight: 2,
        });
        overlaysRef.current.push(polygon);
      } else if (ex.kind === "road_segment" && ex.path.length >= 2) {
        const line = new window.google!.maps.Polyline({
          map,
          path: ex.path,
          strokeColor: "#C23B22",
          strokeOpacity: 0.85,
          strokeWeight: 4,
        });
        overlaysRef.current.push(line);
      } else if ("place" in ex && ex.place) {
        const circle = new window.google!.maps.Circle({
          map,
          center: ex.place.location,
          radius: ex.radiusMeters,
          fillColor: "#C23B22",
          fillOpacity: 0.12,
          strokeColor: "#C23B22",
          strokeWeight: 1.5,
        });
        overlaysRef.current.push(circle);
        addMarker(ex.place.location, "×", "#C23B22");
      }
    });

    if (exclusionDraftPoints.length > 0) {
      exclusionDraftPoints.forEach((p, i) =>
        addMarker(p, String(i + 1), "#C23B22"),
      );
    }

    if (!(navActive && navigation.followMap)) {
      const focus = collectFocusPoints();
      const bounds = boundsFromPoints(focus);
      if (bounds && focus.length === 1) {
        map.setCenter(focus[0]);
        map.setZoom(12);
      } else if (bounds && focus.length > 1) {
        map.fitBounds(
          {
            north: bounds.north,
            south: bounds.south,
            east: bounds.east,
            west: bounds.west,
          },
          64,
        );
      }
    }
    // Intentional: avoid redrawing static overlays on every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nav progress only for remaining polyline
  }, [
    trip,
    routes,
    exclusionDraftPoints,
    parkingSpots,
    selectedParkingId,
    selectParking,
    fuelStations,
    selectedFuelId,
    selectFuel,
    navActive,
    navigation.status,
    navigation.followMap,
    navigation.nextWaypointIndex,
    navigation.alerts?.alerts,
    navigation.progress?.traveledMeters,
    navigation.progress?.segmentIndex,
    navigation.progress?.snapped?.lat,
    navigation.progress?.snapped?.lng,
    setActivePanel,
    setMobilePanelOpen,
    ready,
    theme,
  ]);

  // Persistent, smooth car cursor (not destroyed every GPS tick)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !ready) return;

    if (!navActive || !navigation.position) {
      navMarkerRef.current?.setMap(null);
      navMarkerRef.current = null;
      accuracyRef.current?.setMap(null);
      accuracyRef.current = null;
      displayPosRef.current = null;
      return;
    }

    // Prefer snapped-on-route point so the chevron stays on the line
    const onRoute =
      navigation.progress &&
      !navigation.progress.offRoute &&
      navigation.progress.crossTrackMeters < 35;
    const rawTarget =
      onRoute && navigation.progress
        ? navigation.progress.snapped
        : navigation.position;
    targetPosRef.current = rawTarget;
    targetHeadingRef.current = effectiveNavHeading(navigation);

    if (!displayPosRef.current) {
      displayPosRef.current = rawTarget;
      displayHeadingRef.current = targetHeadingRef.current;
    }

    const fill =
      navigation.status === "off_route" ? "#EF4444" : "#2563EB";

    if (!navMarkerRef.current) {
      navMarkerRef.current = new window.google.maps.Marker({
        map,
        position: displayPosRef.current,
        zIndex: 999,
        optimized: false,
        title: "La tua posizione",
        icon: {
          path: NAV_CHEVRON_PATH,
          fillColor: fill,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
          scale: 1,
          rotation: displayHeadingRef.current,
          anchor: new window.google.maps.Point(0, 0),
        },
      });
    }

    if (
      navigation.accuracyMeters != null &&
      navigation.accuracyMeters > 0 &&
      navigation.accuracyMeters < 80
    ) {
      if (!accuracyRef.current) {
        accuracyRef.current = new window.google.maps.Circle({
          map,
          center: displayPosRef.current,
          radius: navigation.accuracyMeters,
          fillColor: fill,
          fillOpacity: 0.1,
          strokeColor: fill,
          strokeOpacity: 0.3,
          strokeWeight: 1,
          clickable: false,
          zIndex: 1,
        });
      } else {
        accuracyRef.current.setRadius(navigation.accuracyMeters);
      }
    } else if (accuracyRef.current) {
      accuracyRef.current.setMap(null);
      accuracyRef.current = null;
    }

    // Update icon color if status changed
    const icon = navMarkerRef.current.getIcon();
    if (icon && typeof icon === "object" && "fillColor" in icon) {
      navMarkerRef.current.setIcon({
        ...(icon as google.maps.Symbol),
        fillColor: fill,
        path: NAV_CHEVRON_PATH,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- field-level deps avoid marker thrash
  }, [
    ready,
    navActive,
    navigation.position?.lat,
    navigation.position?.lng,
    navigation.headingDeg,
    navigation.compassHeadingDeg,
    navigation.progress?.snapped?.lat,
    navigation.progress?.snapped?.lng,
    navigation.progress?.offRoute,
    navigation.progress?.crossTrackMeters,
    navigation.progress?.routeBearingDeg,
    navigation.speedMps,
    navigation.status,
    navigation.accuracyMeters,
  ]);

  // rAF smoother for marker + camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !navActive || !navigation.followMap) {
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (!navActive) {
        try {
          map?.setTilt(0);
          map?.setHeading(0);
        } catch {
          // ignore
        }
      }
      return;
    }

    let alive = true;
    const tick = () => {
      if (!alive) return;
      const target = targetPosRef.current;
      if (!target) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      const cur = displayPosRef.current ?? target;
      const speed = navigation.speedMps ?? 0;
      // Higher alpha when moving fast so we don't lag behind GPS
      const alpha = speed > 12 ? 0.28 : speed > 4 ? 0.18 : 0.12;
      const nextPos = lerpLatLng(cur, target, alpha);
      // Snap heading faster when on-route so the chevron doesn't stay skewed
      const onRoute =
        useTripStore.getState().navigation.progress &&
        !useTripStore.getState().navigation.progress?.offRoute;
      const nextHeading = lerpHeading(
        displayHeadingRef.current,
        targetHeadingRef.current,
        onRoute ? (speed > 4 ? 0.38 : 0.28) : speed > 4 ? 0.22 : 0.14,
      );
      displayPosRef.current = nextPos;
      displayHeadingRef.current = nextHeading;

      if (navMarkerRef.current) {
        navMarkerRef.current.setPosition(nextPos);
        const icon = navMarkerRef.current.getIcon();
        if (icon && typeof icon === "object") {
          navMarkerRef.current.setIcon({
            ...(icon as google.maps.Symbol),
            path: NAV_CHEVRON_PATH,
            rotation: nextHeading,
          });
        }
      }
      accuracyRef.current?.setCenter(nextPos);

      const northUp = useTripStore.getState().navigation.northUp;
      const camHeading = northUp ? 0 : nextHeading;
      const camTilt = northUp ? 0 : isVector ? 55 : 0;
      // Short look-ahead so the chevron stays visible above the HUD
      const lookAheadM = northUp ? 0 : speed > 10 ? 40 : 22;
      const focus =
        lookAheadM > 0
          ? destinationPoint(nextPos, nextHeading, lookAheadM)
          : nextPos;
      map.moveCamera?.({
        center: focus,
        heading: camHeading,
        tilt: camTilt,
        zoom: speed > 18 ? 16.5 : 17.5,
      });
      // Fallback if moveCamera unavailable
      if (!map.moveCamera) {
        map.panTo(focus);
        try {
          map.setHeading(camHeading);
          map.setTilt(camTilt);
        } catch {
          // ignore
        }
        const z = speed > 18 ? 16 : 18;
        if (Math.abs((map.getZoom() ?? z) - z) > 0.6) map.setZoom(z);
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      alive = false;
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [
    ready,
    navActive,
    navigation.followMap,
    navigation.speedMps,
    isVector,
  ]);

  if (mapsMode === "demo" || !browserMapsKey) {
    return <DemoMap />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className={`h-full w-full transition-[cursor] duration-200 ${
          mapPickTarget ? "cursor-crosshair" : ""
        }`}
      />
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--mist)]/90 p-6 text-center text-sm text-[var(--ink)]">
          {loadError}
        </div>
      ) : null}
      {mapPickTarget ? (
        <div className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--ink)]/90 px-4 py-2 text-xs font-medium text-white shadow-lg animate-[fadeSlide_200ms_ease]">
          Modalità selezione attiva
        </div>
      ) : null}
    </div>
  );
}

function DemoMap() {
  const trip = useTripStore((s) => s.trip);
  const mapPickTarget = useTripStore((s) => s.mapPickTarget);
  const handleMapClick = useTripStore((s) => s.handleMapClick);
  const exclusionDraftPoints = useTripStore((s) => s.exclusionDraftPoints);

  const points = [
    trip.origin && { ...trip.origin.location, kind: "A" as const },
    ...trip.stops.map((s, i) => ({
      ...s.place.location,
      kind: String(i + 1),
    })),
    trip.destination && { ...trip.destination.location, kind: "B" as const },
    ...exclusionDraftPoints.map((p, i) => ({
      ...p,
      kind: `e${i + 1}`,
    })),
  ].filter(Boolean) as Array<LatLng & { kind: string }>;

  function project(lat: number, lng: number) {
    const x = ((lng - 6.5) / (18.5 - 6.5)) * 100;
    const y = ((47.1 - lat) / (47.1 - 36.5)) * 100;
    return {
      left: `${Math.min(96, Math.max(4, x))}%`,
      top: `${Math.min(96, Math.max(4, y))}%`,
    };
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-[linear-gradient(160deg,var(--surface-3)_0%,var(--mist)_45%,var(--brand-soft)_100%)] ${
        mapPickTarget ? "cursor-crosshair" : ""
      }`}
      onClick={(e) => {
        if (!mapPickTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const lng = 6.5 + x * (18.5 - 6.5);
        const lat = 47.1 - y * (47.1 - 36.5);
        handleMapClick(lat, lng);
      }}
    >
      <div className="absolute top-4 left-4 z-10 max-w-xs rounded-2xl border border-[var(--line)] bg-[var(--surface)]/90 px-4 py-3 shadow-sm backdrop-blur">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
          Modalità demo
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--ink)]">
          Mappa illustrativa
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
          Imposta{" "}
          <code className="rounded bg-[var(--surface-2)] px-1">
            NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
          </code>{" "}
          per la mappa Google reale.
        </p>
      </div>

      {points.map((p) => {
        const style = project(p.lat, p.lng);
        return (
          <div
            key={`${p.kind}-${p.lat}-${p.lng}`}
            className="absolute z-[5] flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[var(--brand)] text-[11px] font-bold text-white shadow-md animate-[popIn_280ms_ease]"
            style={style}
            title={p.kind}
          >
            {p.kind}
          </div>
        );
      })}
    </div>
  );
}
