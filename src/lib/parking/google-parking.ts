import type { LatLng } from "@/lib/types/trip";
import type { ParkingSpot } from "@/lib/parking/types";
import {
  easyParkPublicSearch,
  mapsSearchUrl,
  mentionsEasyPark,
  withDistance,
} from "@/lib/parking/helpers";

/**
 * Google Places (New) nearby + text search for parking.
 * Price level is coarse; detailed tariffs come from OSM / EasyPark docs.
 */
export async function searchGoogleParking(params: {
  center: LatLng;
  radiusMeters: number;
  apiKey: string;
  query?: string;
  limit?: number;
}): Promise<{ spots: ParkingSpot[]; error?: string }> {
  const { center, apiKey } = params;
  const radius = Math.min(Math.max(params.radiusMeters, 100), 5000);
  const limit = params.limit ?? 20;

  try {
    const [nearby, texted] = await Promise.all([
      placesSearchNearby(center, radius, apiKey, limit),
      placesTextSearch(
        params.query?.trim()
          ? `${params.query.trim()} parcheggio`
          : `parcheggio vicino`,
        center,
        radius,
        apiKey,
        Math.min(10, limit),
      ),
    ]);

    const easyText = await placesTextSearch(
      "EasyPark parcheggio",
      center,
      radius,
      apiKey,
      8,
    );

    const spots = [...nearby, ...texted, ...tagEasyPark(easyText)];
    return { spots };
  } catch (err) {
    return {
      spots: [],
      error: err instanceof Error ? err.message : "Google Places non disponibile",
    };
  }
}

function tagEasyPark(spots: ParkingSpot[]): ParkingSpot[] {
  return spots.map((s) => ({
    ...s,
    sources: Array.from(new Set([...s.sources, "easypark" as const])),
    easyPark:
      s.easyPark ??
      easyParkPublicSearch({
        lat: s.location.lat,
        lng: s.location.lng,
        label: s.name,
      }),
  }));
}

async function placesSearchNearby(
  center: LatLng,
  radiusMeters: number,
  apiKey: string,
  limit: number,
): Promise<ParkingSpot[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.currentOpeningHours,places.websiteUri,places.googleMapsUri,places.priceLevel,places.types,places.parkingOptions",
    },
    body: JSON.stringify({
      includedTypes: ["parking"],
      maxResultCount: Math.min(20, limit),
      languageCode: "it",
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    // Nearby may be restricted; don't fail the whole search.
    return [];
  }
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).map((p) => googlePlaceToSpot(p, center));
}

async function placesTextSearch(
  textQuery: string,
  center: LatLng,
  radiusMeters: number,
  apiKey: string,
  limit: number,
): Promise<ParkingSpot[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.currentOpeningHours,places.websiteUri,places.googleMapsUri,places.priceLevel,places.types",
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "it",
      maxResultCount: Math.min(20, limit),
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? [])
    .filter((p) => {
      const types = p.types ?? [];
      const name = p.displayName?.text ?? "";
      return (
        types.includes("parking") ||
        /park|parcheggio|sosta|garage/i.test(name) ||
        mentionsEasyPark(name)
      );
    })
    .map((p) => googlePlaceToSpot(p, center));
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  currentOpeningHours?: { openNow?: boolean };
  websiteUri?: string;
  googleMapsUri?: string;
  priceLevel?: string;
  types?: string[];
}

function googlePlaceToSpot(place: GooglePlace, center: LatLng): ParkingSpot {
  const lat = place.location?.latitude ?? center.lat;
  const lng = place.location?.longitude ?? center.lng;
  const name = place.displayName?.text ?? "Parcheggio";
  const priceLevel = place.priceLevel;
  const pricing =
    priceLevel && priceLevel !== "PRICE_LEVEL_FREE"
      ? ("paid" as const)
      : priceLevel === "PRICE_LEVEL_FREE"
        ? ("free" as const)
        : ("unknown" as const);

  const costSummary =
    pricing === "free"
      ? "Gratuito (indicazione Google)"
      : pricing === "paid"
        ? priceLevelToLabel(priceLevel)
        : "Tariffa non indicata da Google";

  const easy = mentionsEasyPark(name, place.websiteUri, place.formattedAddress);

  return {
    id: `ggl-${place.id ?? `${lat},${lng}`}`,
    name,
    location: { lat, lng },
    address: place.formattedAddress,
    distanceMeters: withDistance({ lat, lng }, center),
    pricing,
    cost: { summary: costSummary, raw: priceLevel },
    sources: easy ? ["google_maps", "easypark"] : ["google_maps"],
    easyPark: easy
      ? easyParkPublicSearch({ lat, lng, label: name })
      : undefined,
    mapsUrl:
      place.googleMapsUri ?? mapsSearchUrl(lat, lng, name),
    website: place.websiteUri,
    openNow: place.currentOpeningHours?.openNow,
    rating: place.rating,
  };
}

function priceLevelToLabel(level?: string): string {
  switch (level) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return "A pagamento · economico (Google)";
    case "PRICE_LEVEL_MODERATE":
      return "A pagamento · medio (Google)";
    case "PRICE_LEVEL_EXPENSIVE":
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "A pagamento · alto (Google)";
    default:
      return "A pagamento (Google)";
  }
}
