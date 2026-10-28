import type { LatLng } from "@/lib/types/trip";
import type { FuelStation } from "@/lib/fuel/types";
import { normalizeBrandKey } from "@/lib/fuel/brands";
import {
  mapsSearchUrl,
  osmAmenitySignal,
  textMentions24h,
  textMentionsAdBlue,
  withDistance,
} from "@/lib/fuel/helpers";

const OVERPASS_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
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
 * OpenStreetMap fuel stations near a point (ODbL).
 * AdBlue / H24 / truck tags are the primary structured signals.
 */
export async function searchOsmFuel(params: {
  center: LatLng;
  radiusMeters: number;
  preferAdBlue?: boolean;
  preferLpg?: boolean;
  limit?: number;
}): Promise<{ stations: FuelStation[]; error?: string }> {
  const { center, radiusMeters } = params;
  const limit = params.limit ?? 40;
  const r = Math.min(Math.max(radiusMeters, 200), 20000);
  const adblueFilter = params.preferAdBlue
    ? `node["amenity"="fuel"]["fuel:adblue"="yes"](around:${r},${center.lat},${center.lng});
  way["amenity"="fuel"]["fuel:adblue"="yes"](around:${r},${center.lat},${center.lng});`
    : "";
  const lpgFilter = params.preferLpg
    ? `node["amenity"="fuel"]["fuel:lpg"="yes"](around:${r},${center.lat},${center.lng});
  way["amenity"="fuel"]["fuel:lpg"="yes"](around:${r},${center.lat},${center.lng});`
    : "";
  const query = `
[out:json][timeout:25];
(
  node["amenity"="fuel"](around:${r},${center.lat},${center.lng});
  way["amenity"="fuel"](around:${r},${center.lat},${center.lng});
  ${adblueFilter}
  ${lpgFilter}
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
          "User-Agent":
            "ItineraFuel/1.0 (https://github.com/Andrew231716/itinera)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(28000),
      });
      if (!res.ok) {
        lastError = `Overpass HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[] };
      const stations = (data.elements ?? [])
        .map((el) => osmElementToStation(el, center))
        .filter((s): s is FuelStation => Boolean(s));
      return { stations };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Overpass error";
    }
  }
  return { stations: [], error: lastError };
}

function osmElementToStation(
  el: OsmElement,
  center: LatLng,
): FuelStation | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  const tags = el.tags ?? {};
  const brand = tags.brand || tags.operator;
  const rawName = tags.name || tags["name:it"] || "";
  const name = rawName || brand || "Distributore";

  const adblue = osmAmenitySignal(tags, [
    "fuel:adblue",
    "fuel:AdBlue",
    "fuel:urea",
  ]);
  const diesel = osmAmenitySignal(tags, ["fuel:diesel"]);
  const petrol = osmAmenitySignal(tags, [
    "fuel:octane_95",
    "fuel:octane_98",
    "fuel:petrol",
  ]);
  const lpg = osmAmenitySignal(tags, ["fuel:lpg"]);
  const cng = osmAmenitySignal(tags, ["fuel:cng", "fuel:methane"]);
  const electric = osmAmenitySignal(tags, ["fuel:electricity"]);
  const truck = osmAmenitySignal(tags, [
    "hgv",
    "truck",
    "fuel:hgv_diesel",
    "amenity:truck_stop",
  ]);

  const opening = tags.opening_hours ?? "";
  const open24h =
    opening === "24/7" || textMentions24h(opening, tags.description)
      ? ("yes" as const)
      : osmAmenitySignal(tags, ["opening_hours:24_7"]);

  const notes: string[] = [];
  if (adblue === "yes") notes.push("AdBlue segnalato (OSM)");
  else if (textMentionsAdBlue(tags.description, tags.name, tags.brand)) {
    notes.push("AdBlue menzionato nel testo OSM");
  }
  if (open24h === "yes") notes.push("Aperto 24 ore su 24 secondo la scheda");
  if (opening && open24h !== "yes") notes.push(`Orari: ${opening}`);
  if (tags.phone || tags["contact:phone"]) {
    // phone shown separately
  }

  const phone = tags.phone || tags["contact:phone"] || tags["contact:mobile"];
  const hasAdBlueHint =
    adblue === "yes" ||
    textMentionsAdBlue(tags.description, tags.name, tags.brand);

  const displayName =
    brand && rawName && !rawName.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} – ${rawName}`
      : name;
  const address = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:city"],
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: `osm-fuel-${el.type}-${el.id}`,
    name: displayName,
    brand,
    brandKey: normalizeBrandKey(brand, displayName),
    location: { lat, lng },
    address: address || undefined,
    distanceMeters: withDistance({ lat, lng }, center),
    phone,
    website: tags.website || tags["contact:website"],
    mapsUrl: mapsSearchUrl(lat, lng, name),
    openingHours: opening || undefined,
    sources: ["openstreetmap"],
    amenities: {
      adblue: hasAdBlueHint && adblue !== "no" ? "yes" : adblue,
      diesel,
      petrol,
      lpg,
      cng,
      electric,
      truck: truck === "yes" || tags.hgv === "yes" ? "yes" : truck,
      open24h,
    },
    notes,
    verifyByPhone: Boolean(phone) || hasAdBlueHint,
  };
}
