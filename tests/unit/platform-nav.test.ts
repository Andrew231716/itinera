/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectNavPlatform,
  isNativeNavigationAvailable,
  watchNavigationPosition,
} from "@/lib/navigation/platform";

describe("navigation platform", () => {
  afterEach(() => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
    vi.restoreAllMocks();
  });

  it("defaults to web without Capacitor", () => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
    expect(detectNavPlatform()).toBe("web");
    expect(isNativeNavigationAvailable()).toBe(false);
  });

  it("detects Capacitor native shell", () => {
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
    };
    expect(detectNavPlatform()).toBe("capacitor");
    expect(isNativeNavigationAvailable()).toBe(true);
  });

  it("uses browser geolocation on web", async () => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
    const watchPosition = vi.fn((_ok, _err, _opts) => 42);
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition, clearWatch },
      configurable: true,
    });

    const onFix = vi.fn();
    const onError = vi.fn();
    const watcher = await watchNavigationPosition(onFix, onError);
    expect(watchPosition).toHaveBeenCalled();
    watcher.clear();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
