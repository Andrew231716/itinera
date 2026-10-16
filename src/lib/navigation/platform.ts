import type { LatLng } from "@/lib/types/trip";

export type NavPlatform = "web" | "capacitor";

export interface NavPositionFix {
  position: LatLng;
  headingDeg: number | null;
  accuracyMeters: number | null;
  speedMps: number | null;
  timestamp: number;
}

export interface PositionWatcher {
  clear: () => void;
}

type WatchSuccess = (fix: NavPositionFix) => void;
type WatchError = (message: string, permissionDenied?: boolean) => void;

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

export function detectNavPlatform(): NavPlatform {
  if (typeof window === "undefined") return "web";
  try {
    if (window.Capacitor?.isNativePlatform?.()) return "capacitor";
  } catch {
    // ignore
  }
  return "web";
}

export function isNativeNavigationAvailable(): boolean {
  return detectNavPlatform() === "capacitor";
}

/**
 * Unified position watcher: Capacitor Geolocation when native, else browser.
 * Background tracking on device is enabled via Capacitor config + OS permissions
 * (see docs/MOBILE_APP.md) — the WebView keeps receiving updates while the
 * foreground service / background mode is active.
 */
export async function watchNavigationPosition(
  onFix: WatchSuccess,
  onError: WatchError,
): Promise<PositionWatcher> {
  if (detectNavPlatform() === "capacitor") {
    try {
      const mod = await import("@capacitor/geolocation");
      const Geolocation = mod.Geolocation;
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000 },
        (pos, err) => {
          if (err || !pos) {
            onError(err?.message ?? "GPS nativo non disponibile.", false);
            return;
          }
          onFix({
            position: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
            headingDeg:
              pos.coords.heading != null && Number.isFinite(pos.coords.heading)
                ? pos.coords.heading
                : null,
            accuracyMeters: pos.coords.accuracy ?? null,
            speedMps:
              pos.coords.speed != null && Number.isFinite(pos.coords.speed)
                ? pos.coords.speed
                : null,
            timestamp: pos.timestamp ?? Date.now(),
          });
        },
      );
      return {
        clear: () => {
          void Geolocation.clearWatch({ id });
        },
      };
    } catch {
      // Fall through to web geolocation inside the WebView.
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError("Geolocalizzazione non disponibile su questo dispositivo.", false);
    return { clear: () => undefined };
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onFix({
        position: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        },
        headingDeg:
          pos.coords.heading != null && Number.isFinite(pos.coords.heading)
            ? pos.coords.heading
            : null,
        accuracyMeters: pos.coords.accuracy,
        speedMps:
          pos.coords.speed != null && Number.isFinite(pos.coords.speed)
            ? pos.coords.speed
            : null,
        timestamp: pos.timestamp,
      });
    },
    (err) => {
      onError(
        err.code === err.PERMISSION_DENIED
          ? "Permesso posizione negato. Abilitalo per navigare."
          : "Impossibile ottenere la posizione GPS.",
        err.code === err.PERMISSION_DENIED,
      );
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    },
  );

  return {
    clear: () => navigator.geolocation.clearWatch(id),
  };
}
