import type { LatLng } from "@/lib/types/trip";

/**
 * Approximate country polygons for hard «avoid country» exclusions.
 * Not cadastral: conservative enough to catch transit corridors (e.g. Ticino).
 */
export interface CountryZone {
  id: string;
  label: string;
  /** Aliases matched against exclusion labels (lowercase) */
  aliases: string[];
  polygon: LatLng[];
}

/** Switzerland incl. Ticino (Lugano / Mendrisio / Chiasso corridor). */
export const SWITZERLAND_ZONE: CountryZone = {
  id: "country_ch",
  label: "Svizzera",
  aliases: [
    "svizzera",
    "switzerland",
    "schweiz",
    "suisse",
    "swiss",
    "ch",
    "confederazione elvetica",
  ],
  polygon: [
    { lat: 47.81, lng: 8.57 },
    { lat: 47.7, lng: 9.2 },
    { lat: 47.52, lng: 9.56 },
    { lat: 47.0, lng: 10.49 },
    { lat: 46.5, lng: 10.4 },
    { lat: 46.13, lng: 10.2 },
    { lat: 45.82, lng: 9.08 }, // sud Ticino / sotto Chiasso
    { lat: 45.83, lng: 9.0 },
    { lat: 45.86, lng: 8.95 },
    { lat: 45.95, lng: 8.85 },
    { lat: 46.05, lng: 8.7 },
    { lat: 46.15, lng: 8.3 },
    { lat: 46.2, lng: 7.5 },
    { lat: 46.15, lng: 6.9 },
    { lat: 46.2, lng: 6.1 }, // Genèvè area
    { lat: 46.5, lng: 6.0 },
    { lat: 46.95, lng: 6.1 },
    { lat: 47.4, lng: 6.9 },
    { lat: 47.6, lng: 7.6 },
    { lat: 47.81, lng: 8.57 },
  ],
};

export const KNOWN_COUNTRY_ZONES: CountryZone[] = [SWITZERLAND_ZONE];

/** Match a free-text exclusion label to a known country zone. */
export function matchCountryZone(label: string): CountryZone | null {
  const raw = label.trim().toLowerCase();
  if (!raw) return null;
  // Normalize common phrasing: "evita la Svizzera", "non passare dalla Svizzera"
  const cleaned = raw
    .replace(/^(evita(re)?|non\s+(attraversare|passare\s+(da|per)|entrare\s+in)|avoid)\s+/i, "")
    .replace(/^(la|il|lo|le|l'|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const zone of KNOWN_COUNTRY_ZONES) {
    for (const alias of zone.aliases) {
      if (
        cleaned === alias ||
        cleaned.includes(alias) ||
        raw === alias ||
        raw.includes(alias)
      ) {
        // Avoid matching tiny substrings inside unrelated words
        if (alias.length <= 2) {
          const re = new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i");
          if (!re.test(raw) && !re.test(cleaned)) continue;
        }
        return zone;
      }
    }
  }
  return null;
}
