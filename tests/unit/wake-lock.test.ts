/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireWakeLock,
  isWakeLockApiAvailable,
  releaseWakeLock,
} from "@/lib/navigation/wake-lock";

describe("wake-lock", () => {
  afterEach(async () => {
    await releaseWakeLock();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports API availability", () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: undefined,
      configurable: true,
    });
    expect(isWakeLockApiAvailable()).toBe(false);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn() },
      configurable: true,
    });
    expect(isWakeLockApiAvailable()).toBe(true);
  });

  it("acquires native wake lock when API works", async () => {
    const release = vi.fn(async () => undefined);
    const addEventListener = vi.fn();
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: vi.fn(async () => ({
          released: false,
          release,
          addEventListener,
        })),
      },
      configurable: true,
    });
    const state = await acquireWakeLock();
    expect(state.mode).toBe("wake-lock");
    expect(state.active).toBe(true);
    expect(addEventListener).toHaveBeenCalled();
  });

  it("falls back when wake lock rejects", async () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
      configurable: true,
    });
    class FakeAudioContext {
      createGain() {
        return { gain: { value: 0 }, connect: vi.fn() };
      }
      createOscillator() {
        return {
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => undefined);
      destination = {};
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const state = await acquireWakeLock();
    expect(state.mode).toBe("audio-fallback");
    expect(state.active).toBe(true);
  });
});
