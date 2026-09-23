"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import type { LatLng } from "@/lib/types/trip";
import { boundsFromPoints } from "@/lib/utils/geometry";

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
  const { trip, routes, exclusionDraftPoints } = useTripStore.getState();
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
  return points;
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const browserMapsKey = useTripStore((s) => s.browserMapsKey);
  const mapsMode = useTripStore((s) => s.mapsMode);
  const trip = useTripStore((s) => s.trip);
  const routes = useTripStore((s) => s.routes);
  const exclusionDraftPoints = useTripStore((s) => s.exclusionDraftPoints);
  const mapPickTarget = useTripStore((s) => s.mapPickTarget);
  const handleMapClick = useTripStore((s) => s.handleMapClick);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!browserMapsKey || !containerRef.current) return;
    let cancelled = false;

    loadGoogleMaps(browserMapsKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center: { lat: 42.5, lng: 12.5 },
          zoom: 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: MAP_STYLES as unknown as google.maps.MapTypeStyle[],
        });
        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [browserMapsKey]);

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
          scale: 12,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      overlaysRef.current.push(marker);
    };

    if (trip.origin) addMarker(trip.origin.location, "A", "#2C5F7C");
    trip.stops.forEach((s, i) =>
      addMarker(s.place.location, String(i + 1), "#4A7C8C"),
    );
    if (trip.destination) addMarker(trip.destination.location, "B", "#D4A017");

    const selected =
      routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0];
    if (selected?.decodedPath.length) {
      const poly = new window.google.maps.Polyline({
        map,
        path: selected.decodedPath,
        strokeColor: "#2C5F7C",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
      overlaysRef.current.push(poly);
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
      if (exclusionDraftPoints.length >= 2) {
        const draft = new window.google.maps.Polyline({
          map,
          path: exclusionDraftPoints,
          strokeColor: "#C23B22",
          strokeOpacity: 0.7,
          strokeWeight: 2,
          icons: [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                scale: 3,
              },
              offset: "0",
              repeat: "12px",
            },
          ],
        });
        overlaysRef.current.push(draft);
      }
    }

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
  }, [trip, routes, exclusionDraftPoints, ready]);

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
    // Rough Italy-centered projection for demo visualization only
    const x = ((lng - 6.5) / (18.5 - 6.5)) * 100;
    const y = ((47.1 - lat) / (47.1 - 36.5)) * 100;
    return {
      left: `${Math.min(96, Math.max(4, x))}%`,
      top: `${Math.min(96, Math.max(4, y))}%`,
    };
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-[linear-gradient(160deg,#d9e6ef_0%,#eef3f7_45%,#d5e4dc_100%)] ${
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
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(44,95,124,0.12), transparent 40%), radial-gradient(circle at 80% 70%, rgba(212,160,23,0.12), transparent 35%), linear-gradient(rgba(44,95,124,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(44,95,124,0.06) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 48px 48px, 48px 48px",
        }}
      />
      <div className="absolute top-4 left-4 z-10 max-w-xs rounded-2xl border border-white/60 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
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
          per la mappa Google reale. I marker demo posizionano le località
          note; nessun routing inventato.
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

      {trip.exclusions
        .filter((ex) => ex.kind === "geo_zone")
        .map((ex) => {
          if (ex.kind !== "geo_zone" || ex.polygon.length === 0) return null;
          const xs = ex.polygon.map((p) => project(p.lat, p.lng));
          return (
            <div
              key={ex.id}
              className="pointer-events-none absolute inset-0"
              aria-hidden
            >
              {xs.map((s, i) => (
                <div
                  key={i}
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/80"
                  style={s}
                />
              ))}
            </div>
          );
        })}
    </div>
  );
}

const MAP_STYLES: Array<Record<string, unknown>> = [
  { elementType: "geometry", stylers: [{ color: "#eef3f7" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6b7c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#eef3f7" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#c5d2dc" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#d9e4ec" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#c5d9e8" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#e4ece6" }],
  },
];
