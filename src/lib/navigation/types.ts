import type { LatLng } from "@/lib/types/trip";

export interface NavManeuver {
  id: string;
  instruction: string;
  /** Distance of this step alone */
  distanceMeters: number;
  durationSeconds: number;
  /** Cumulative distance from route start to the beginning of this step */
  startOffsetMeters: number;
  /** Approximate position where this maneuver begins */
  location: LatLng;
}

export interface NavProgress {
  /** Closest point on the route polyline */
  snapped: LatLng;
  /** Index into decodedPath of the segment start */
  segmentIndex: number;
  /** Distance traveled along the route from origin */
  traveledMeters: number;
  /** Remaining distance to destination along the route */
  remainingMeters: number;
  /** Estimated remaining time (proportional to route duration) */
  remainingSeconds: number;
  /** Distance from GPS fix to the route (off-route detector) */
  crossTrackMeters: number;
  /** Bearing of the current route segment (degrees, 0 = north) */
  routeBearingDeg: number;
  /** Active / next maneuver */
  currentManeuverIndex: number;
  nextManeuver: NavManeuver | null;
  /** Meters until next maneuver */
  metersToNextManeuver: number;
  offRoute: boolean;
  arrived: boolean;
}

export type NavigationStatus =
  | "idle"
  | "starting"
  | "navigating"
  | "off_route"
  | "arrived"
  | "error";

export type WakeLockUiMode =
  | "wake-lock"
  | "audio-fallback"
  | "unsupported"
  | "inactive";

export interface NavigationRuntime {
  status: NavigationStatus;
  voiceEnabled: boolean;
  followMap: boolean;
  position: LatLng | null;
  headingDeg: number | null;
  accuracyMeters: number | null;
  speedMps: number | null;
  progress: NavProgress | null;
  error: string | null;
  /** Last instruction spoken (to avoid repeats) */
  lastSpokenManeuverId: string | null;
  /** Screen kept awake while navigating */
  wakeLockActive: boolean;
  wakeLockMode: WakeLockUiMode;
  /** web PWA vs Capacitor native shell */
  platform: "web" | "capacitor";
}
