import type { CustomExclusion, LatLng, PlaceRef, TravelMode } from "./trip";

export interface RouteLeg {
  id: string;
  startLabel: string;
  endLabel: string;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds?: number;
  steps: RouteStep[];
}

export interface RouteStep {
  id: string;
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
}

export interface TollInfo {
  currencyCode?: string;
  estimatedPrice?: number;
  /** True when the API reported tolls but no price */
  hasTolls: boolean;
  notes?: string;
}

export interface ConstraintViolation {
  exclusionId: string;
  exclusionLabel: string;
  severity: "hard" | "soft";
  message: string;
}

export interface ComputedRoute {
  id: string;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds?: number;
  polyline: string;
  decodedPath: LatLng[];
  legs: RouteLeg[];
  tolls?: TollInfo;
  warnings: string[];
  violations: ConstraintViolation[];
  /** Engine that produced this route */
  engine: "google_routes" | "demo" | "alternative";
  rawDescription?: string;
}

export interface RouteComputeRequest {
  origin: PlaceRef;
  destination: PlaceRef;
  intermediates: PlaceRef[];
  travelMode: TravelMode;
  departureAt: string | null;
  preferences: {
    avoidTolls: boolean;
    avoidHighways: boolean;
    avoidFerries: boolean;
    preferFastest: boolean;
    preferShortest: boolean;
  };
  optimizeWaypointOrder: boolean;
  exclusions: CustomExclusion[];
}

export interface RouteComputeResponse {
  mode: "live" | "demo";
  routes: ComputedRoute[];
  optimizedIntermediateOrder?: number[];
  limitations: string[];
  error?: string;
}

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText?: string;
  fullText: string;
  location?: LatLng;
  source: "google" | "demo";
}
