/**
 * Keep the screen awake during navigation (Screen Wake Lock API).
 * Re-acquires when the tab becomes visible again.
 */

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

let sentinel: WakeLockSentinelLike | null = null;
let visibilityHandler: (() => void) | null = null;
let audioCtx: AudioContext | null = null;
let osc: OscillatorNode | null = null;

export type WakeLockMode =
  | "wake-lock"
  | "audio-fallback"
  | "unsupported"
  | "inactive";

export interface WakeLockState {
  active: boolean;
  mode: WakeLockMode;
}

async function requestNativeWakeLock(): Promise<boolean> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
  };
  if (!nav.wakeLock?.request) return false;
  try {
    sentinel = await nav.wakeLock.request("screen");
    sentinel.addEventListener?.("release", () => {
      sentinel = null;
    });
    return true;
  } catch {
    sentinel = null;
    return false;
  }
}

/** Silent oscillator — helps some Android browsers keep the page "active". */
function startAudioKeepalive(): boolean {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return false;
    audioCtx = new Ctx();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.001; // nearly silent
    osc = audioCtx.createOscillator();
    osc.frequency.value = 20;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    void audioCtx.resume();
    return true;
  } catch {
    return false;
  }
}

function stopAudioKeepalive(): void {
  try {
    osc?.stop();
  } catch {
    // ignore
  }
  osc = null;
  try {
    void audioCtx?.close();
  } catch {
    // ignore
  }
  audioCtx = null;
}

/** Acquire screen wake lock. Re-acquires on visibilitychange. */
export async function acquireWakeLock(): Promise<WakeLockState> {
  await releaseWakeLock();

  const ok = await requestNativeWakeLock();
  if (ok) {
    visibilityHandler = () => {
      if (document.visibilityState === "visible" && !sentinel) {
        void requestNativeWakeLock();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityHandler);
    }
    // Pair with tiny audio keepalive on mobile for better foreground retention.
    startAudioKeepalive();
    return { active: true, mode: "wake-lock" };
  }

  if (startAudioKeepalive()) {
    return { active: true, mode: "audio-fallback" };
  }

  return { active: false, mode: "unsupported" };
}

export async function releaseWakeLock(): Promise<void> {
  if (visibilityHandler) {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityHandler);
    }
    visibilityHandler = null;
  }
  if (sentinel && !sentinel.released) {
    try {
      await sentinel.release();
    } catch {
      // ignore
    }
  }
  sentinel = null;
  stopAudioKeepalive();
}

export function isWakeLockApiAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    wakeLock?: { request?: unknown };
  };
  return typeof nav.wakeLock?.request === "function";
}
