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
  /** Multi-stop: index into stops+destination of the next target */
  nextWaypointIndex: number;
  nextWaypointLabel: string | null;
  nextWaypointKind: "stop" | "destination" | null;
  metersToNextWaypoint: number;
  /** Reached an intermediate stop (navigation continues) */
  atIntermediateStop: boolean;
  totalWaypoints: number;
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
  /** Keep camera locked on GPS (disabled when user pans the map) */
  followMap: boolean;
  /** North-up instead of heading-up */
  northUp: boolean;
  /** Brief pulse: fit remaining route in view */
  overview: boolean;
  /** Landscape driving HUD dock side */
  hudSide: "left" | "right";
  /** True while recalculating from current GPS */
  recalculating: boolean;
  /**
   * Next waypoint index in [stops…, destination].
   * Advanced when an intermediate stop is reached so navigation continues.
   */
  nextWaypointIndex: number;
  /** Last intermediate stop we already announced */
  lastArrivedWaypointId: string | null;
  position: LatLng | null;
  /** GPS course over ground when available */
  headingDeg: number | null;
  /** Device compass / gyroscope heading */
  compassHeadingDeg: number | null;
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
