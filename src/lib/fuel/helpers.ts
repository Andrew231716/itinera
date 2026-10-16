import { haversineMeters } from "@/lib/utils/geometry";
import type { LatLng } from "@/lib/types/trip";
import type {
  AmenitySignal,
  FuelAmenityKey,
  FuelStation,
} from "@/lib/fuel/types";

export function mapsSearchUrl(lat: number, lng: number, label?: string): string {
  const q = label
    ? encodeURIComponent(`${label} @${lat},${lng}`)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function withDistance(location: LatLng, center: LatLng): number {
  return Math.round(haversineMeters(center, location));
}

export function sortByDistance(stations: FuelStation[]): FuelStation[] {
  return [...stations].sort((a, b) => a.distanceMeters - b.distanceMeters);
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

export function mergeStations(stations: FuelStation[]): FuelStation[] {
  const byKey = new Map<string, FuelStation>();
  for (const station of stations) {
    const key = `${station.location.lat.toFixed(5)},${station.location.lng.toFixed(5)}`;
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
    byKey.set(key, {
      ...existing,
      name:
        existing.name.length >= station.name.length
          ? existing.name
          : station.name,
      brand: existing.brand ?? station.brand,
      address: existing.address ?? station.address,
      phone: existing.phone ?? station.phone,
      website: existing.website ?? station.website,
      openNow: existing.openNow ?? station.openNow,
      openingHours: existing.openingHours ?? station.openingHours,
      rating: existing.rating ?? station.rating,
      sources: Array.from(new Set([...existing.sources, ...station.sources])),
      amenities,
      notes: Array.from(new Set([...existing.notes, ...station.notes])),
      verifyByPhone: existing.verifyByPhone || station.verifyByPhone,
      distanceMeters: Math.min(
        existing.distanceMeters,
        station.distanceMeters,
      ),
    });
  }
  return sortByDistance(Array.from(byKey.values()));
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
