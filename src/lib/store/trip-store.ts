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
import type { ParkingSpot } from "@/lib/parking/types";
import { parkingSpotToPlaceRef } from "@/lib/parking/place-ref";
import type { FuelStation } from "@/lib/fuel/types";
import { fuelStationToPlaceRef } from "@/lib/fuel/place-ref";
import type {
  NavigationRuntime,
  NavProgress,
} from "@/lib/navigation/types";
import { stopNavigationSpeech } from "@/lib/navigation/voice";
import { detectNavPlatform } from "@/lib/navigation/platform";
import { releaseWakeLock } from "@/lib/navigation/wake-lock";

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
  | "parking"
  | "fuel"
  | "navigate"
  | "assistant"
  | "setup"
  | "saved";

const IDLE_NAVIGATION: NavigationRuntime = {
  status: "idle",
  voiceEnabled: true,
  followMap: true,
  northUp: false,
  overview: false,
  hudSide: "right",
  recalculating: false,
  nextWaypointIndex: 0,
  lastArrivedWaypointId: null,
  position: null,
  headingDeg: null,
  compassHeadingDeg: null,
  accuracyMeters: null,
  speedMps: null,
  progress: null,
  error: null,
  lastSpokenManeuverId: null,
  wakeLockActive: false,
  wakeLockMode: "inactive",
  platform: "web",
};

interface TripState {
  trip: TripDraft;
  routes: ComputedRoute[];
  routeLimitations: string[];
  routeMode: "idle" | "loading" | "live" | "demo" | "error";
  routeError: string | null;
  mapsMode: "unknown" | "live" | "demo";
  browserMapsKey: string | null;
  mapsMapId: string | null;
  mapPickTarget: MapPickTarget;
  activePanel: PanelTab;
  mobilePanelOpen: boolean;
  exclusionDraftPoints: { lat: number; lng: number }[];
  savedTrips: TripDraft[];
  tripHistory: TripHistoryEntry[];

  /** Nearby parking results for the active search center */
  parkingSpots: ParkingSpot[];
  selectedParkingId: string | null;
  parkingCenter: { lat: number; lng: number; label: string } | null;
  /** Bumps when a new parking search is requested (destination / AI / manual) */
  parkingSearchNonce: number;

  /** Nearby fuel stations for the active search center / corridor */
  fuelStations: FuelStation[];
  selectedFuelId: string | null;
  fuelCenter: { lat: number; lng: number; label: string } | null;
  /** Bumps when a new fuel search is requested (AI / manual / GPS) */
  fuelSearchNonce: number;

  /** In-app guided navigation along the selected Itinera route */
  navigation: NavigationRuntime;

  setActivePanel: (tab: PanelTab) => void;
  setMobilePanelOpen: (open: boolean) => void;
  setMapPickTarget: (target: MapPickTarget) => void;
  setTitle: (title: string) => void;
  setOrigin: (place: PlaceRef | null) => void;
  setDestination: (place: PlaceRef | null) => void;
  swapOriginDestination: () => void;
  addStop: (place: PlaceRef) => void;
  /**
   * Extend the trip: previous destination becomes the next intermediate stop,
   * and `place` becomes the new final destination.
   */
  pushStopAsDestination: (place: PlaceRef) => void;
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
  setMapsConfig: (
    mode: "live" | "demo",
    browserKey: string | null,
    mapId?: string | null,
  ) => void;
  loadTrip: (trip: TripDraft) => void;
  /** Restore a previously downloaded offline pack (trip + routes). */
  loadOfflinePack: (pack: {
    trip: TripDraft;
    routes: ComputedRoute[];
    selectedRouteId: string | null;
  }) => void;
  resetTrip: () => void;
  persistTrip: () => Promise<void>;
  refreshSavedTrips: () => Promise<void>;
  duplicateCurrentTrip: () => Promise<void>;
  removeSavedTrip: (id: string) => Promise<void>;
  refreshTripHistory: () => void;
  loadHistoryEntry: (entry: TripHistoryEntry) => void;
  removeHistoryEntry: (id: string) => void;
  clearHistory: () => void;

  setParkingSpots: (spots: ParkingSpot[]) => void;
  selectParking: (id: string | null) => void;
  /** Search parking near a place and open the parking panel */
  requestParkingNear: (center: {
    lat: number;
    lng: number;
    label: string;
  }) => void;
  /** Apply selected parking as destination or as an intermediate stop */
  applySelectedParking: (mode: "destination" | "stop") => void;

  setFuelStations: (stations: FuelStation[]) => void;
  selectFuel: (id: string | null) => void;
  /** Open fuel panel for corridor search (uses origin→destination when set) */
  openFuelPanel: () => void;
  /** Search fuel stations near a place and open the fuel panel */
  requestFuelNear: (center: {
    lat: number;
    lng: number;
    label: string;
  }) => void;
  /** Apply selected fuel station as destination or as an intermediate stop */
  applySelectedFuel: (mode: "destination" | "stop") => void;

  startNavigation: () => void;
  stopNavigation: () => void;
  setNavigationVoice: (enabled: boolean) => void;
  setNavigationFollowMap: (enabled: boolean) => void;
  setNavigationNorthUp: (enabled: boolean) => void;
  setNavigationOverview: (enabled: boolean) => void;
  setNavigationHudSide: (side: "left" | "right") => void;
  setNavigationRecalculating: (busy: boolean) => void;
  recenterNavigation: () => void;
  setNavigationCompassHeading: (headingDeg: number | null) => void;
  setNavigationWakeLock: (state: {
    active: boolean;
    mode: NavigationRuntime["wakeLockMode"];
  }) => void;
  updateNavigationFix: (fix: {
    position: { lat: number; lng: number };
    headingDeg: number | null;
    accuracyMeters: number | null;
    speedMps: number | null;
  }) => void;
  setNavigationProgress: (progress: NavProgress) => void;
  markNavigationSpoken: (maneuverId: string) => void;
  /** Advance past an intermediate stop (continue toward next / destination). */
  advancePastWaypoint: (arrivedId: string, nextIndex: number) => void;
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
  mapsMapId: null,
  mapPickTarget: null,
  activePanel: "itinerary",
  mobilePanelOpen: true,
  exclusionDraftPoints: [],
  savedTrips: [],
  tripHistory: [],
  parkingSpots: [],
  selectedParkingId: null,
  parkingCenter: null,
  parkingSearchNonce: 0,
  fuelStations: [],
  selectedFuelId: null,
  fuelCenter: null,
  fuelSearchNonce: 0,
  navigation: { ...IDLE_NAVIGATION },

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
      // Keep a suggested parking center, but do not open the panel or
      // trigger a search — the user starts that from Parcheggi explicitly.
      ...(place
        ? {
            parkingCenter: {
              lat: place.location.lat,
              lng: place.location.lng,
              label: place.label,
            },
          }
        : {}),
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

  pushStopAsDestination: (place) =>
    set((s) => {
      const prevDest = s.trip.destination;
      const stops = [...s.trip.stops];
      if (prevDest) {
        stops.push({ id: nanoid(), place: prevDest });
      }
      return {
        trip: touch({
          ...s.trip,
          stops,
          destination: place,
        }),
        mapPickTarget: null,
        parkingCenter: {
          lat: place.location.lat,
          lng: place.location.lng,
          label: place.label,
        },
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
        // Map-picked "tappa" extends the trip: last place becomes destination.
        get().pushStopAsDestination(place);
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

  setMapsConfig: (mode, browserKey, mapId) =>
    set({
      mapsMode: mode,
      browserMapsKey: browserKey,
      mapsMapId: mapId ?? null,
    }),

  loadTrip: (trip) =>
    set({
      trip,
      routes: [],
      routeLimitations: [],
      routeMode: "idle",
      routeError: null,
    }),

  loadOfflinePack: (pack) =>
    set({
      trip: {
        ...pack.trip,
        selectedRouteId:
          pack.selectedRouteId ?? pack.routes[0]?.id ?? null,
      },
      routes: pack.routes,
      routeLimitations: [
        "Percorso caricato offline: le indicazioni usano i dati scaricati (senza ricalcolo live).",
      ],
      routeMode: pack.routes.length ? "live" : "idle",
      routeError: null,
      activePanel: "summary",
      mobilePanelOpen: true,
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

  setParkingSpots: (spots) =>
    set((s) => ({
      parkingSpots: spots,
      selectedParkingId:
        s.selectedParkingId && spots.some((p) => p.id === s.selectedParkingId)
          ? s.selectedParkingId
          : null,
    })),

  selectParking: (id) => set({ selectedParkingId: id }),

  requestParkingNear: (center) =>
    set((s) => ({
      parkingCenter: center,
      parkingSearchNonce: s.parkingSearchNonce + 1,
      selectedParkingId: null,
      activePanel: "parking",
      mobilePanelOpen: true,
    })),

  applySelectedParking: (mode) => {
    const { parkingSpots, selectedParkingId } = get();
    const spot = parkingSpots.find((p) => p.id === selectedParkingId);
    if (!spot) return;
    const place = parkingSpotToPlaceRef(spot);
    if (mode === "destination") {
      set((s) => ({
        trip: touch({ ...s.trip, destination: place }),
        mapPickTarget: null,
        activePanel: "itinerary",
        mobilePanelOpen: true,
      }));
    } else {
      get().addStop(place);
      set({ activePanel: "itinerary", mobilePanelOpen: true });
    }
  },

  setFuelStations: (stations) =>
    set((s) => ({
      fuelStations: stations,
      selectedFuelId:
        s.selectedFuelId && stations.some((f) => f.id === s.selectedFuelId)
          ? s.selectedFuelId
          : null,
    })),

  selectFuel: (id) => set({ selectedFuelId: id }),

  openFuelPanel: () =>
    set((s) => ({
      fuelCenter: null,
      fuelSearchNonce: s.fuelSearchNonce + 1,
      selectedFuelId: null,
      activePanel: "fuel",
      mobilePanelOpen: true,
    })),

  requestFuelNear: (center) =>
    set((s) => ({
      fuelCenter: center,
      fuelSearchNonce: s.fuelSearchNonce + 1,
      selectedFuelId: null,
      activePanel: "fuel",
      mobilePanelOpen: true,
    })),

  applySelectedFuel: (mode) => {
    const { fuelStations, selectedFuelId } = get();
    const station = fuelStations.find((f) => f.id === selectedFuelId);
    if (!station) return;
    const place = fuelStationToPlaceRef(station);
    if (mode === "destination") {
      set((s) => ({
        trip: touch({ ...s.trip, destination: place }),
        mapPickTarget: null,
        activePanel: "itinerary",
        mobilePanelOpen: true,
      }));
    } else {
      get().addStop(place);
      set({ activePanel: "itinerary", mobilePanelOpen: true });
    }
  },

  startNavigation: () => {
    const { routes, trip } = get();
    const selected =
      routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0] ?? null;
    if (!selected || selected.decodedPath.length < 2) {
      set({
        navigation: {
          ...IDLE_NAVIGATION,
          status: "error",
          error: "Calcola prima un percorso in Itinera.",
        },
        activePanel: "navigate",
        mobilePanelOpen: true,
      });
      return;
    }
    set({
      navigation: {
        ...IDLE_NAVIGATION,
        status: "starting",
        voiceEnabled: get().navigation.voiceEnabled,
        followMap: true,
        northUp: get().navigation.northUp,
        hudSide: get().navigation.hudSide,
        platform: detectNavPlatform(),
      },
      activePanel: "navigate",
      // Collapse the planning sheet — driving HUD takes over on the map.
      mobilePanelOpen: false,
    });
    // Move to navigating once GPS watch attaches (hook upgrades status)
    setTimeout(() => {
      const nav = get().navigation;
      if (nav.status === "starting") {
        set({ navigation: { ...nav, status: "navigating" } });
      }
    }, 400);
  },

  stopNavigation: () => {
    stopNavigationSpeech();
    void releaseWakeLock();
    set({
      navigation: {
        ...IDLE_NAVIGATION,
        voiceEnabled: get().navigation.voiceEnabled,
        platform: detectNavPlatform(),
      },
      mobilePanelOpen: true,
      activePanel: "summary",
    });
  },

  setNavigationVoice: (enabled) =>
    set((s) => {
      if (!enabled) stopNavigationSpeech();
      return { navigation: { ...s.navigation, voiceEnabled: enabled } };
    }),

  setNavigationFollowMap: (enabled) =>
    set((s) => ({ navigation: { ...s.navigation, followMap: enabled } })),

  setNavigationNorthUp: (enabled) =>
    set((s) => ({
      navigation: {
        ...s.navigation,
        northUp: enabled,
        // Re-lock camera when toggling orientation mode
        followMap: true,
        overview: false,
      },
    })),

  setNavigationOverview: (enabled) =>
    set((s) => ({
      navigation: {
        ...s.navigation,
        overview: enabled,
        followMap: enabled ? false : s.navigation.followMap,
      },
    })),

  setNavigationHudSide: (side) =>
    set((s) => ({
      navigation: { ...s.navigation, hudSide: side },
    })),

  setNavigationRecalculating: (busy) =>
    set((s) => ({
      navigation: { ...s.navigation, recalculating: busy },
    })),

  recenterNavigation: () =>
    set((s) => ({
      navigation: {
        ...s.navigation,
        followMap: true,
        overview: false,
      },
    })),

  setNavigationCompassHeading: (headingDeg) =>
    set((s) => ({
      navigation: { ...s.navigation, compassHeadingDeg: headingDeg },
    })),

  setNavigationWakeLock: ({ active, mode }) =>
    set((s) => ({
      navigation: {
        ...s.navigation,
        wakeLockActive: active,
        wakeLockMode: mode,
      },
    })),

  updateNavigationFix: (fix) =>
    set((s) => ({
      navigation: {
        ...s.navigation,
        position: fix.position,
        headingDeg: fix.headingDeg,
        accuracyMeters: fix.accuracyMeters,
        speedMps: fix.speedMps,
        error: null,
        status:
          s.navigation.status === "starting"
            ? "navigating"
            : s.navigation.status === "idle"
              ? "idle"
              : s.navigation.status,
      },
    })),

  setNavigationProgress: (progress) =>
    set((s) => {
      const wasOff = s.navigation.status === "off_route";
      // Hysteresis: require getting closer before clearing off-route.
      const stillOff = wasOff
        ? progress.crossTrackMeters > 45
        : progress.offRoute;
      return {
        navigation: {
          ...s.navigation,
          progress: { ...progress, offRoute: stillOff },
          // Keep committed index at least as far as progress suggests
          nextWaypointIndex: Math.max(
            s.navigation.nextWaypointIndex,
            progress.nextWaypointIndex,
          ),
          status: progress.arrived
            ? "arrived"
            : stillOff
              ? "off_route"
              : s.navigation.status === "arrived"
                ? "arrived"
                : "navigating",
        },
      };
    }),

  markNavigationSpoken: (maneuverId) =>
    set((s) => ({
      navigation: { ...s.navigation, lastSpokenManeuverId: maneuverId },
    })),

  advancePastWaypoint: (arrivedId, nextIndex) =>
    set((s) => ({
      navigation: {
        ...s.navigation,
        lastArrivedWaypointId: arrivedId,
        nextWaypointIndex: Math.max(nextIndex, s.navigation.nextWaypointIndex),
      },
    })),
}));
