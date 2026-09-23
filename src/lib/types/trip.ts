export type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TWO_WHEELER";

export type RoutePreference = "TRAFFIC_AWARE_OPTIMAL" | "SHORTER" | "FUEL_EFFICIENT";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceRef {
  id: string;
  label: string;
  address?: string;
  placeId?: string;
  location: LatLng;
  source: "places" | "map_click" | "manual" | "demo" | "assistant";
}

export interface TripStop {
  id: string;
  place: PlaceRef;
  /** Optional dwell time in minutes */
  dwellMinutes?: number;
  notes?: string;
}

export interface RoadPreferences {
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  /** Preferential only — Google Routes may not support tunnels directly */
  avoidTunnels: boolean;
  preferFastest: boolean;
  preferShortest: boolean;
  /** Soft preference — not a hard Google Routes flag */
  preferScenic: boolean;
  /** Soft constraint: max extra travel time in minutes (null = no limit) */
  maxExtraMinutes: number | null;
}

export type ExclusionKind =
  | "city"
  | "address"
  | "road"
  | "road_segment"
  | "geo_zone";

export type ConstraintStrength = "hard" | "soft";

export interface ExclusionBase {
  id: string;
  kind: ExclusionKind;
  label: string;
  strength: ConstraintStrength;
  notes?: string;
  createdAt: string;
}

export interface PointExclusion extends ExclusionBase {
  kind: "city" | "address" | "road";
  place?: PlaceRef;
  /** Approximate avoidance radius in meters for point-like exclusions */
  radiusMeters: number;
}

export interface RoadSegmentExclusion extends ExclusionBase {
  kind: "road_segment";
  path: LatLng[];
  bufferMeters: number;
}

export interface GeoZoneExclusion extends ExclusionBase {
  kind: "geo_zone";
  /** Closed polygon ring (first point may equal last) */
  polygon: LatLng[];
}

export type CustomExclusion =
  | PointExclusion
  | RoadSegmentExclusion
  | GeoZoneExclusion;

export interface TripMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripDraft {
  meta: TripMeta;
  origin: PlaceRef | null;
  destination: PlaceRef | null;
  stops: TripStop[];
  departureAt: string | null;
  travelMode: TravelMode;
  preferences: RoadPreferences;
  exclusions: CustomExclusion[];
  /** When true, intermediate stop order may be optimized by the routing engine */
  optimizeStopOrder: boolean;
  selectedRouteId: string | null;
}

export const DEFAULT_ROAD_PREFERENCES: RoadPreferences = {
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  avoidTunnels: false,
  preferFastest: true,
  preferShortest: false,
  preferScenic: false,
  maxExtraMinutes: null,
};

export function createEmptyTrip(title = "Nuovo viaggio"): TripDraft {
  const now = new Date().toISOString();
  return {
    meta: {
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
    },
    origin: null,
    destination: null,
    stops: [],
    departureAt: null,
    travelMode: "DRIVE",
    preferences: { ...DEFAULT_ROAD_PREFERENCES },
    exclusions: [],
    optimizeStopOrder: false,
    selectedRouteId: null,
  };
}
