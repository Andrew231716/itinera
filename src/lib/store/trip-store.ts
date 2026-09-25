"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import {
  createEmptyTrip,
  type CustomExclusion,
  type GeoZoneExclusion,
  type PlaceRef,
  type RoadPreferences,
  type TravelMode,
  type TripDraft,
  type TripStop,
} from "@/lib/types/trip";
import type { ComputedRoute } from "@/lib/types/route";
import { getTripRepository } from "@/lib/storage/trip-repository";
import {
  clearTripHistory,
  listTripHistory,
  recordTripHistory,
  removeTripHistoryEntry,
  type TripHistoryEntry,
} from "@/lib/storage/trip-history";
import { isValidPolygon } from "@/lib/utils/geometry";
import { createPointExclusion } from "@/lib/routing/exclusion-helpers";

export type MapPickTarget =
  | "origin"
  | "destination"
  | "stop"
  | "exclusion_point"
  | "exclusion_zone"
  | null;

export type PanelTab =
  | "itinerary"
  | "preferences"
  | "exclusions"
  | "summary"
  | "assistant"
  | "setup"
  | "saved";

interface TripState {
  trip: TripDraft;
  routes: ComputedRoute[];
  routeLimitations: string[];
  routeMode: "idle" | "loading" | "live" | "demo" | "error";
  routeError: string | null;
  mapsMode: "unknown" | "live" | "demo";
  browserMapsKey: string | null;
  mapPickTarget: MapPickTarget;
  activePanel: PanelTab;
  mobilePanelOpen: boolean;
  exclusionDraftPoints: { lat: number; lng: number }[];
  savedTrips: TripDraft[];
  tripHistory: TripHistoryEntry[];

  setActivePanel: (tab: PanelTab) => void;
  setMobilePanelOpen: (open: boolean) => void;
  setMapPickTarget: (target: MapPickTarget) => void;
  setTitle: (title: string) => void;
  setOrigin: (place: PlaceRef | null) => void;
  setDestination: (place: PlaceRef | null) => void;
  swapOriginDestination: () => void;
  addStop: (place: PlaceRef) => void;
  updateStop: (id: string, place: PlaceRef) => void;
  removeStop: (id: string) => void;
  clearStops: () => void;
  reorderStops: (fromIndex: number, toIndex: number) => void;
  setDepartureAt: (iso: string | null) => void;
  setTravelMode: (mode: TravelMode) => void;
  setPreferences: (patch: Partial<RoadPreferences>) => void;
  setOptimizeStopOrder: (value: boolean) => void;
  addExclusion: (exclusion: CustomExclusion) => void;
  updateExclusion: (id: string, patch: Partial<CustomExclusion>) => void;
  removeExclusion: (id: string) => void;
  pushExclusionDraftPoint: (lat: number, lng: number) => void;
  clearExclusionDraft: () => void;
  finalizeGeoZone: (label: string) => void;
  handleMapClick: (lat: number, lng: number) => void;
  setSelectedRoute: (routeId: string | null) => void;
  setRoutesResult: (payload: {
    routes: ComputedRoute[];
    limitations: string[];
    mode: "live" | "demo";
  }) => void;
  setRouteLoading: () => void;
  setRouteError: (message: string) => void;
  clearRoutes: () => void;
  setMapsConfig: (mode: "live" | "demo", browserKey: string | null) => void;
  loadTrip: (trip: TripDraft) => void;
  resetTrip: () => void;
  persistTrip: () => Promise<void>;
  refreshSavedTrips: () => Promise<void>;
  duplicateCurrentTrip: () => Promise<void>;
  removeSavedTrip: (id: string) => Promise<void>;
  refreshTripHistory: () => void;
  loadHistoryEntry: (entry: TripHistoryEntry) => void;
  removeHistoryEntry: (id: string) => void;
  clearHistory: () => void;
}

function touch(trip: TripDraft): TripDraft {
  return {
    ...trip,
    meta: { ...trip.meta, updatedAt: new Date().toISOString() },
  };
}

function placeFromMapClick(lat: number, lng: number): PlaceRef {
  return {
    id: nanoid(),
    label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    location: { lat, lng },
    source: "map_click",
  };
}

export const useTripStore = create<TripState>((set, get) => ({
  trip: createEmptyTrip("Il mio itinerario"),
  routes: [],
  routeLimitations: [],
  routeMode: "idle",
  routeError: null,
  mapsMode: "unknown",
  browserMapsKey: null,
  mapPickTarget: null,
  activePanel: "itinerary",
  mobilePanelOpen: true,
  exclusionDraftPoints: [],
  savedTrips: [],
  tripHistory: [],

  setActivePanel: (tab) => set({ activePanel: tab }),
  setMobilePanelOpen: (open) => set({ mobilePanelOpen: open }),
  setMapPickTarget: (target) =>
    set({
      mapPickTarget: target,
      exclusionDraftPoints:
        target === "exclusion_zone" ? get().exclusionDraftPoints : [],
    }),

  setTitle: (title) =>
    set((s) => ({ trip: touch({ ...s.trip, meta: { ...s.trip.meta, title } }) })),

  setOrigin: (place) =>
    set((s) => ({
      trip: touch({ ...s.trip, origin: place }),
      mapPickTarget: null,
    })),

  setDestination: (place) =>
    set((s) => ({
      trip: touch({ ...s.trip, destination: place }),
      mapPickTarget: null,
    })),

  swapOriginDestination: () =>
    set((s) => ({
      trip: touch({
        ...s.trip,
        origin: s.trip.destination,
        destination: s.trip.origin,
      }),
      routes: [],
      routeMode: "idle",
    })),

  addStop: (place) =>
    set((s) => {
      const stop: TripStop = { id: nanoid(), place };
      return {
        trip: touch({ ...s.trip, stops: [...s.trip.stops, stop] }),
        mapPickTarget: null,
        routes: [],
        routeMode: "idle",
      };
    }),

  updateStop: (id, place) =>
    set((s) => ({
      trip: touch({
        ...s.trip,
        stops: s.trip.stops.map((st) =>
          st.id === id ? { ...st, place } : st,
        ),
      }),
      routes: [],
      routeMode: "idle",
    })),

  removeStop: (id) =>
    set((s) => ({
      trip: touch({
        ...s.trip,
        stops: s.trip.stops.filter((st) => st.id !== id),
      }),
      routes: [],
      routeMode: "idle",
    })),

  clearStops: () =>
    set((s) => ({
      trip: touch({ ...s.trip, stops: [] }),
      routes: [],
      routeMode: "idle",
    })),

  reorderStops: (fromIndex, toIndex) =>
    set((s) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= s.trip.stops.length ||
        toIndex >= s.trip.stops.length
      ) {
        return s;
      }
      const stops = [...s.trip.stops];
      const [moved] = stops.splice(fromIndex, 1);
      stops.splice(toIndex, 0, moved);
      return {
        trip: touch({ ...s.trip, stops }),
        routes: [],
        routeMode: "idle",
      };
    }),

  setDepartureAt: (iso) =>
    set((s) => ({ trip: touch({ ...s.trip, departureAt: iso }) })),

  setTravelMode: (mode) =>
    set((s) => ({
      trip: touch({ ...s.trip, travelMode: mode }),
      routes: [],
      routeMode: "idle",
    })),

  setPreferences: (patch) =>
    set((s) => ({
      trip: touch({
        ...s.trip,
        preferences: { ...s.trip.preferences, ...patch },
      }),
      routes: [],
      routeMode: "idle",
    })),

  setOptimizeStopOrder: (value) =>
    set((s) => ({
      trip: touch({ ...s.trip, optimizeStopOrder: value }),
    })),

  addExclusion: (exclusion) =>
    set((s) => ({
      trip: touch({
        ...s.trip,
        exclusions: [...s.trip.exclusions, exclusion],
      }),
      mapPickTarget: null,
      routes: [],
      routeMode: "idle",
    })),

  updateExclusion: (id, patch) =>
    set((s) => ({
      trip: touch({
        ...s.trip,
        exclusions: s.trip.exclusions.map((e) =>
          e.id === id ? ({ ...e, ...patch } as CustomExclusion) : e,
        ),
      }),
      routes: [],
      routeMode: "idle",
    })),

  removeExclusion: (id) =>
    set((s) => ({
      trip: touch({
        ...s.trip,
        exclusions: s.trip.exclusions.filter((e) => e.id !== id),
      }),
      routes: [],
      routeMode: "idle",
    })),

  pushExclusionDraftPoint: (lat, lng) =>
    set((s) => ({
      exclusionDraftPoints: [...s.exclusionDraftPoints, { lat, lng }],
    })),

  clearExclusionDraft: () => set({ exclusionDraftPoints: [] }),

  finalizeGeoZone: (label) => {
    const points = get().exclusionDraftPoints;
    if (points.length < 3) return;
    const validity = isValidPolygon(points);
    if (!validity.valid) return;
    const zone: GeoZoneExclusion = {
      id: nanoid(),
      kind: "geo_zone",
      label: label || "Zona esclusa",
      strength: "hard",
      polygon: points,
      createdAt: new Date().toISOString(),
    };
    get().addExclusion(zone);
    set({ exclusionDraftPoints: [], mapPickTarget: null });
  },

  handleMapClick: (lat, lng) => {
    const target = get().mapPickTarget;
    if (!target) return;
    const place = placeFromMapClick(lat, lng);

    switch (target) {
      case "origin":
        get().setOrigin(place);
        break;
      case "destination":
        get().setDestination(place);
        break;
      case "stop":
        get().addStop(place);
        break;
      case "exclusion_point": {
        get().addExclusion(
          createPointExclusion({
            id: nanoid(),
            kind: "address",
            label: place.label,
            place,
          }),
        );
        break;
      }
      case "exclusion_zone":
        get().pushExclusionDraftPoint(lat, lng);
        break;
    }
  },

  setSelectedRoute: (routeId) =>
    set((s) => ({
      trip: touch({ ...s.trip, selectedRouteId: routeId }),
    })),

  setRoutesResult: ({ routes, limitations, mode }) => {
    const preferred =
      routes.find((r) => r.isConformant === true) ?? routes[0] ?? null;
    const nextTrip = touch({
      ...get().trip,
      selectedRouteId: preferred?.id ?? null,
    });

    set({
      routes,
      routeLimitations: limitations,
      routeMode: mode,
      routeError: null,
      trip: nextTrip,
    });

    // Auto-cronologia: solo calcoli con almeno un percorso reale.
    if (routes.length > 0 && nextTrip.origin && nextTrip.destination) {
      const toll =
        preferred?.tolls?.estimatedPrice ??
        preferred?.tolls?.michelin?.estimatedPrice;
      recordTripHistory({
        trip: nextTrip,
        routeSummary: {
          label: preferred?.label,
          distanceMeters: preferred?.distanceMeters,
          durationSeconds: preferred?.durationSeconds,
          tollEstimate: toll,
          tollCurrency:
            preferred?.tolls?.currencyCode ??
            preferred?.tolls?.michelin?.currencyCode,
          mode,
        },
      });
      set({ tripHistory: listTripHistory() });
    }
  },

  setRouteLoading: () =>
    set({ routeMode: "loading", routeError: null }),

  setRouteError: (message) =>
    set({ routeMode: "error", routeError: message, routes: [] }),

  clearRoutes: () =>
    set((s) => ({
      routes: [],
      routeLimitations: [],
      routeMode: "idle",
      routeError: null,
      trip: touch({ ...s.trip, selectedRouteId: null }),
    })),

  setMapsConfig: (mode, browserKey) =>
    set({ mapsMode: mode, browserMapsKey: browserKey }),

  loadTrip: (trip) =>
    set({
      trip,
      routes: [],
      routeLimitations: [],
      routeMode: "idle",
      routeError: null,
    }),

  resetTrip: () =>
    set({
      trip: createEmptyTrip("Il mio itinerario"),
      routes: [],
      routeLimitations: [],
      routeMode: "idle",
      routeError: null,
      exclusionDraftPoints: [],
      mapPickTarget: null,
    }),

  persistTrip: async () => {
    const repo = getTripRepository();
    const saved = await repo.save(get().trip);
    set({ trip: saved });
    await get().refreshSavedTrips();
  },

  refreshSavedTrips: async () => {
    const repo = getTripRepository();
    const savedTrips = await repo.list();
    set({ savedTrips });
  },

  duplicateCurrentTrip: async () => {
    const repo = getTripRepository();
    await repo.save(get().trip);
    const copy = await repo.duplicate(get().trip.meta.id);
    if (copy) {
      set({ trip: copy, routes: [], routeMode: "idle" });
      await get().refreshSavedTrips();
    }
  },

  removeSavedTrip: async (id) => {
    const repo = getTripRepository();
    await repo.remove(id);
    if (get().trip.meta.id === id) {
      get().resetTrip();
    }
    await get().refreshSavedTrips();
  },

  refreshTripHistory: () => {
    set({ tripHistory: listTripHistory() });
  },

  loadHistoryEntry: (entry) => {
    set({
      trip: structuredClone(entry.trip),
      routes: [],
      routeLimitations: [],
      routeMode: "idle",
      routeError: null,
      activePanel: "itinerary",
    });
  },

  removeHistoryEntry: (id) => {
    removeTripHistoryEntry(id);
    set({ tripHistory: listTripHistory() });
  },

  clearHistory: () => {
    clearTripHistory();
    set({ tripHistory: [] });
  },
}));
