"use client";

import { useCallback, useEffect, useRef } from "react";
import { normalizeHeading } from "@/lib/navigation/destination-point";

type HeadingCallback = (headingDeg: number, source: "compass") => void;

/**
 * Device compass / gyroscope heading (degrees from north).
 * On iOS 13+ requires a user gesture to call requestPermission().
 */
export function useDeviceHeading(
  enabled: boolean,
  onHeading: HeadingCallback,
): { requestPermission: () => Promise<boolean> } {
  const cbRef = useRef(onHeading);
  cbRef.current = onHeading;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handle = (event: DeviceOrientationEvent) => {
      let heading: number | null = null;
      const webkit = event as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      };
      if (
        typeof webkit.webkitCompassHeading === "number" &&
        Number.isFinite(webkit.webkitCompassHeading)
      ) {
        heading = webkit.webkitCompassHeading;
      } else if (event.alpha != null) {
        heading = 360 - event.alpha;
      }
      if (heading == null || !Number.isFinite(heading)) return;
      cbRef.current(normalizeHeading(heading), "compass");
    };

    const absolute = "ondeviceorientationabsolute" in window;
    const type = absolute ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(type, handle as EventListener, true);
    return () => {
      window.removeEventListener(type, handle as EventListener, true);
    };
  }, [enabled]);

  const requestPermission = useCallback(() => requestCompassPermission(), []);

  return { requestPermission };
}

/** Call from a tap handler (required on iOS) before / when starting navigation. */
export async function requestCompassPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied" | "default">;
  };
  if (typeof DOE.requestPermission === "function") {
    try {
      const res = await DOE.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }
  return true;
}
