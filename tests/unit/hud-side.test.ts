import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_NAV_HUD_SIDE,
  readNavHudSide,
  toggleNavHudSide,
  writeNavHudSide,
} from "@/lib/navigation/hud-side";

function installLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  // @ts-expect-error test polyfill
  globalThis.window = { localStorage: ls };
  // @ts-expect-error test polyfill
  globalThis.localStorage = ls;
}

describe("nav hud side", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("defaults to left (Maps-style)", () => {
    expect(DEFAULT_NAV_HUD_SIDE).toBe("left");
    expect(readNavHudSide()).toBe("left");
  });

  it("persists and toggles", () => {
    writeNavHudSide("right");
    expect(readNavHudSide()).toBe("right");
    expect(toggleNavHudSide("right")).toBe("left");
    expect(toggleNavHudSide("left")).toBe("right");
  });
});
