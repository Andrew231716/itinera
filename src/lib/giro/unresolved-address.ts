import type { GiroStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";

/** Address/query that failed geocoding and can be fixed in the Giro UI. */
export type GiroUnresolvedAddress = {
  id: string;
  /** Original text that failed (shown + editable) */
  query: string;
  /** Human-readable reason */
  message: string;
  /** Existing stop to patch when the place is chosen (PDF import) */
  stopId?: string;
};

export function isUnmappedPlace(place: PlaceRef): boolean {
  const { lat, lng } = place.location;
  return (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6)
  );
}

/**
 * Apply a resolved PlaceRef to the tour: patch the linked stop, or return
 * `addPlace` so the caller can append a new GiroStop.
 */
export function applyResolvedGiroAddress(
  stops: GiroStop[],
  unresolved: GiroUnresolvedAddress[],
  unresolvedId: string,
  place: PlaceRef,
): {
  stops: GiroStop[];
  unresolved: GiroUnresolvedAddress[];
  /** When set, caller should append this place as a new stop */
  addPlace: PlaceRef | null;
} {
  const entry = unresolved.find((u) => u.id === unresolvedId);
  if (!entry) {
    return { stops, unresolved, addPlace: null };
  }
  const nextUnresolved = unresolved.filter((u) => u.id !== unresolvedId);

  if (entry.stopId) {
    const nextStops = stops.map((s) => {
      if (s.id !== entry.stopId) return s;
      return {
        ...s,
        place: {
          ...place,
          // Keep the stop name from the piano when present.
          label: s.place.label?.trim() ? s.place.label : place.label,
          address: place.address ?? s.place.address,
        },
      };
    });
    return { stops: nextStops, unresolved: nextUnresolved, addPlace: null };
  }

  return { stops, unresolved: nextUnresolved, addPlace: place };
}

/** Prefer a shorter query for the search box (drop trailing hub noise). */
export function suggestEditQuery(query: string): string {
  const q = query.trim();
  // "Name HUB-…, Milano" → try the leading name + city
  const hub = q.match(/^(.*?)\s+HUB-[^,]+,\s*(.+)$/i);
  if (hub) {
    const name = hub[1].replace(/^(Cms|CMS)\s+/i, "").trim();
    const city = hub[2].trim();
    if (name && city) return `${name}, ${city}`;
  }
  return q;
}
