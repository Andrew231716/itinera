export type NavHudSide = "left" | "right";

const STORAGE_KEY = "itinera.nav.hudSide";

/** Default matches Maps landscape: info cards on the left, controls on the right. */
export const DEFAULT_NAV_HUD_SIDE: NavHudSide = "left";

export function readNavHudSide(): NavHudSide {
  if (typeof window === "undefined") return DEFAULT_NAV_HUD_SIDE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "left" || v === "right") return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_NAV_HUD_SIDE;
}

export function writeNavHudSide(side: NavHudSide): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, side);
  } catch {
    /* ignore */
  }
}

export function toggleNavHudSide(side: NavHudSide): NavHudSide {
  return side === "left" ? "right" : "left";
}
