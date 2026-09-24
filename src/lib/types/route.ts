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

export interface MichelinTollDetail {
  estimatedPrice?: number;
  currencyCode?: string;
  barriers?: Array<{
    name: string;
    amount?: number;
    currencyCode?: string;
  }>;
  vignettes?: Array<{
    name: string;
    amount?: number;
    currencyCode?: string;
    message?: string;
  }>;
  matchedSummary?: string;
  distanceMeters?: number;
  notes?: string;
}

export interface TollInfo {
  currencyCode?: string;
  estimatedPrice?: number;
  /** True when the API reported tolls but no price */
  hasTolls: boolean;
  notes?: string;
  /** Provenance of the primary amount when present */
  source?: "google_routes" | "michelin" | "combined";
  /** Independent ViaMichelin estimate for the same OD (may differ from Google) */
  michelin?: MichelinTollDetail;
}

export interface ZoneAdvisory {
  id: string;
  label: string;
  kind: "ztl" | "traffic_limited" | "other";
  message: string;
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
  /** Hard exclusions that could not be verified on this geometry */
  unverifiableConstraints?: Array<{
    exclusionId: string;
    exclusionLabel: string;
    reason: string;
  }>;
  /** True only when hard exclusions are verified with no hard violations */
  isConformant?: boolean;
  /** Milan Area B / Area C and similar advisories */
  zoneAdvisories?: ZoneAdvisory[];
  /** Engine that produced this route */
  engine: "google_routes" | "demo" | "openrouteservice" | "alternative";
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
  preferenceStatuses?: import("@/lib/routing/preference-mapper").PreferenceStatusItem[];
  engineId?: string;
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
