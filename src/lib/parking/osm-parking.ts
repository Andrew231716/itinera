import type { LatLng } from "@/lib/types/trip";
import type { ParkingSpot } from "@/lib/parking/types";
import {
  classifyFee,
  easyParkPublicSearch,
  mapsSearchUrl,
  mentionsEasyPark,
  withDistance,
} from "@/lib/parking/helpers";

const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

/**
 * OpenStreetMap parking nodes/ways near a point (ODbL open data).
 * Fee/charge tags are the closest free “official” tariff signals for street parking.
 */
export async function searchOsmParking(params: {
  center: LatLng;
  radiusMeters: number;
  limit?: number;
}): Promise<{ spots: ParkingSpot[]; error?: string }> {
  const { center, radiusMeters } = params;
  const limit = params.limit ?? 40;
  const r = Math.min(Math.max(radiusMeters, 100), 5000);
  const query = `
[out:json][timeout:25];
(
  node["amenity"="parking"](around:${r},${center.lat},${center.lng});
  way["amenity"="parking"](around:${r},${center.lat},${center.lng});
  node["amenity"="parking_entrance"](around:${r},${center.lat},${center.lng});
);
out center tags ${limit};
`.trim();

  let lastError = "Overpass non raggiungibile";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": "ItineraParking/1.0 (https://github.com/Andrew231716/itinera)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(28000),
      });
      if (!res.ok) {
        lastError = `Overpass HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[] };
      const spots = (data.elements ?? [])
        .map((el) => osmElementToSpot(el, center))
        .filter((s): s is ParkingSpot => Boolean(s));
      return { spots };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Overpass error";
    }
  }
  return { spots: [], error: lastError };
}

function osmElementToSpot(
  el: OsmElement,
  center: LatLng,
): ParkingSpot | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  const tags = el.tags ?? {};
  const name =
    tags.name ||
    tags["name:it"] ||
    tags.operator ||
    tags.brand ||
    "Parcheggio";
  const fee = classifyFee({
    fee: tags.fee,
    charge: tags.charge,
    parking: tags.parking,
    access: tags.access,
  });
  const easy =
    mentionsEasyPark(
      tags.operator,
      tags.brand,
      tags.name,
      tags["payment:easypark"],
      tags["app:easypark"],
      tags.payment,
      tags.description,
    ) || tags["payment:easypark"] === "yes";

  const capacity = tags.capacity ? Number.parseInt(tags.capacity, 10) : undefined;
  const notes: string[] = [];
  if (tags.maxstay) notes.push(`Sosta max: ${tags.maxstay}`);
  if (tags.opening_hours) notes.push(`Orari: ${tags.opening_hours}`);
  if (tags.wheelchair) notes.push(`Accessibilità: ${tags.wheelchair}`);

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    location: { lat, lng },
    address: [
      tags["addr:street"],
      tags["addr:housenumber"],
      tags["addr:city"],
    ]
      .filter(Boolean)
      .join(" "),
    distanceMeters: withDistance({ lat, lng }, center),
    pricing: fee.pricing,
    cost: {
      summary: fee.summary ?? "Tariffa non indicata",
      raw: fee.raw,
    },
    capacity: Number.isFinite(capacity) ? capacity : undefined,
    parkingType: tags.parking || tags.parking_space,
    operator: tags.operator || tags.brand,
    sources: easy ? ["openstreetmap", "easypark"] : ["openstreetmap"],
    easyPark: easy
      ? easyParkPublicSearch({ lat, lng, label: name })
      : undefined,
    mapsUrl: mapsSearchUrl(lat, lng, name),
    website: tags.website || tags["contact:website"],
    notes: notes.length ? notes : undefined,
  };
}
