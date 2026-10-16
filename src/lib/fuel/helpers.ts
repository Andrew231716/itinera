import { haversineMeters } from "@/lib/utils/geometry";
import type { LatLng } from "@/lib/types/trip";
import type {
  AmenitySignal,
  FuelAmenityKey,
  FuelPriceQuote,
  FuelStation,
} from "@/lib/fuel/types";

export function mapsSearchUrl(lat: number, lng: number, label?: string): string {
  const q = label
    ? encodeURIComponent(`${label} @${lat},${lng}`)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Google Maps driving directions from A → station. */
export function mapsDirectionsUrl(params: {
  origin: LatLng;
  destination: LatLng;
  destinationLabel?: string;
}): string {
  const search = new URLSearchParams({
    api: "1",
    origin: `${params.origin.lat.toFixed(6)},${params.origin.lng.toFixed(6)}`,
    destination: `${params.destination.lat.toFixed(6)},${params.destination.lng.toFixed(6)}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${search.toString()}`;
}

export function withDistance(location: LatLng, center: LatLng): number {
  return Math.round(haversineMeters(center, location));
}

export function sortByDistance(stations: FuelStation[]): FuelStation[] {
  return [...stations].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Prefer AdBlue-confirmed stations, then closer ones. */
export function rankStations(stations: FuelStation[]): FuelStation[] {
  return [...stations].sort((a, b) => {
    const aAd = a.amenities.adblue === "yes" ? 0 : 1;
    const bAd = b.amenities.adblue === "yes" ? 0 : 1;
    if (aAd !== bAd) return aAd - bAd;
    const a24 = a.amenities.open24h === "yes" ? 0 : 1;
    const b24 = b.amenities.open24h === "yes" ? 0 : 1;
    if (a24 !== b24) return a24 - b24;
    return a.distanceMeters - b.distanceMeters;
  });
}

/** Min distance to any corridor sample point (origin / mid / dest). */
export function corridorDistance(location: LatLng, centers: LatLng[]): number {
  if (centers.length === 0) return 0;
  return Math.min(...centers.map((c) => withDistance(location, c)));
}

export function osmAmenitySignal(
  tags: Record<string, string>,
  keys: string[],
): AmenitySignal {
  for (const key of keys) {
    const v = (tags[key] ?? "").trim().toLowerCase();
    if (!v) continue;
    if (["yes", "true", "1", "only"].includes(v)) return "yes";
    if (["no", "false", "0"].includes(v)) return "no";
  }
  return "unknown";
}

export function textMentionsAdBlue(
  ...parts: Array<string | undefined | null>
): boolean {
  return parts.some((p) => /ad\s*blue|adblue|urea/i.test(p ?? ""));
}

export function textMentions24h(
  ...parts: Array<string | undefined | null>
): boolean {
  return parts.some((p) =>
    /24\s*h|24\/7|h24|24\s*ore|sempre aperto|non.?stop|continuativ/i.test(
      p ?? "",
    ),
  );
}

const MERGE_METERS = 45;

function findMergeKey(
  station: FuelStation,
  byKey: Map<string, FuelStation>,
): string {
  const exact = `${station.location.lat.toFixed(4)},${station.location.lng.toFixed(4)}`;
  if (byKey.has(exact)) return exact;
  for (const [key, existing] of byKey) {
    if (withDistance(station.location, existing.location) <= MERGE_METERS) {
      return key;
    }
  }
  return exact;
}

export function mergeStations(stations: FuelStation[]): FuelStation[] {
  const byKey = new Map<string, FuelStation>();
  for (const station of stations) {
    const key = findMergeKey(station, byKey);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, station);
      continue;
    }
    const amenities: FuelStation["amenities"] = { ...existing.amenities };
    for (const [k, v] of Object.entries(station.amenities) as Array<
      [FuelAmenityKey, AmenitySignal]
    >) {
      if (v === "yes" || (v === "no" && amenities[k] !== "yes")) {
        amenities[k] = v;
      } else if (!amenities[k]) {
        amenities[k] = v;
      }
    }
    const prices =
      (existing.prices?.length ?? 0) >= (station.prices?.length ?? 0)
        ? existing.prices
        : station.prices;
    byKey.set(key, {
      ...existing,
      name:
        existing.name.length >= station.name.length
          ? existing.name
          : station.name,
      brand: existing.brand ?? station.brand,
      brandKey: existing.brandKey ?? station.brandKey,
      address: existing.address || station.address,
      phone: existing.phone ?? station.phone,
      website: existing.website ?? station.website,
      openNow: existing.openNow ?? station.openNow,
      openingHours: existing.openingHours ?? station.openingHours,
      rating: existing.rating ?? station.rating,
      sources: Array.from(new Set([...existing.sources, ...station.sources])),
      amenities,
      prices,
      notes: Array.from(new Set([...existing.notes, ...station.notes])),
      verifyByPhone: existing.verifyByPhone || station.verifyByPhone,
      distanceMeters: Math.min(
        existing.distanceMeters,
        station.distanceMeters,
      ),
    });
  }
  return rankStations(Array.from(byKey.values()));
}

export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export function amenityLabel(key: FuelAmenityKey): string {
  switch (key) {
    case "adblue":
      return "AdBlue";
    case "diesel":
      return "Diesel";
    case "petrol":
      return "Benzina";
    case "lpg":
      return "GPL";
    case "cng":
      return "Metano";
    case "electric":
      return "Elettrico";
    case "truck":
      return "Camion";
    case "open24h":
      return "H24";
  }
}

/** Compact line for cards: Benzina/Gasolio/GPL/Metano when present. */
export function pickHighlightPrices(
  prices: FuelPriceQuote[],
): FuelPriceQuote[] {
  const preferred = ["Benzina", "Gasolio", "GPL", "Metano"];
  const out: FuelPriceQuote[] = [];
  for (const label of preferred) {
    const match =
      prices.find((p) => p.fuel === label && p.isSelf) ??
      prices.find((p) => p.fuel === label) ??
      prices.find(
        (p) =>
          p.fuel.toLowerCase().includes(label.toLowerCase()) && p.isSelf,
      ) ??
      prices.find((p) =>
        p.fuel.toLowerCase().includes(label.toLowerCase()),
      );
    if (match) out.push(match);
  }
  return out;
}
