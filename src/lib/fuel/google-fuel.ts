import type { LatLng } from "@/lib/types/trip";
import type { FuelStation } from "@/lib/fuel/types";
import {
  mapsSearchUrl,
  textMentions24h,
  textMentionsAdBlue,
  withDistance,
} from "@/lib/fuel/helpers";

/**
 * Google Places (New) nearby + text search for gas stations.
 * AdBlue is inferred from name/text queries — always verify by phone.
 */
export async function searchGoogleFuel(params: {
  center: LatLng;
  radiusMeters: number;
  apiKey: string;
  query?: string;
  preferAdBlue?: boolean;
  limit?: number;
}): Promise<{ stations: FuelStation[]; error?: string }> {
  const { center, apiKey } = params;
  const radius = Math.min(Math.max(params.radiusMeters, 200), 20000);
  const limit = params.limit ?? 20;

  try {
    const textQueries = [
      params.query?.trim()
        ? `${params.query.trim()} distributore`
        : "distributore di benzina",
      ...(params.preferAdBlue || !params.query
        ? ["AdBlue", "distributore AdBlue", "Q8 AdBlue", "Eni AdBlue"]
        : []),
    ];

    const [nearby, ...textBatches] = await Promise.all([
      placesSearchNearby(center, radius, apiKey, limit),
      ...textQueries.map((q) =>
        placesTextSearch(q, center, radius, apiKey, Math.min(10, limit)),
      ),
    ]);

    const stations = [...nearby, ...textBatches.flat()];
    return { stations };
  } catch (err) {
    return {
      stations: [],
      error:
        err instanceof Error ? err.message : "Google Places non disponibile",
    };
  }
}

async function placesSearchNearby(
  center: LatLng,
  radiusMeters: number,
  apiKey: string,
  limit: number,
): Promise<FuelStation[]> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.currentOpeningHours,places.regularOpeningHours,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.types",
      },
      body: JSON.stringify({
        includedTypes: ["gas_station"],
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
    },
  );

  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).map((p) => googlePlaceToStation(p, center));
}

async function placesTextSearch(
  textQuery: string,
  center: LatLng,
  radiusMeters: number,
  apiKey: string,
  limit: number,
): Promise<FuelStation[]> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.currentOpeningHours,places.regularOpeningHours,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.types",
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
    },
  );

  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? [])
    .filter((p) => {
      const types = p.types ?? [];
      const name = p.displayName?.text ?? "";
      return (
        types.includes("gas_station") ||
        /q8|eni|ip|esso|shell|tamoil|distributore|benzina|adblue|gasolio/i.test(
          name,
        )
      );
    })
    .map((p) =>
      googlePlaceToStation(p, center, {
        adblueFromQuery: /ad\s*blue|adblue/i.test(textQuery),
      }),
    );
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  types?: string[];
}

function googlePlaceToStation(
  place: GooglePlace,
  center: LatLng,
  opts?: { adblueFromQuery?: boolean },
): FuelStation {
  const lat = place.location?.latitude ?? center.lat;
  const lng = place.location?.longitude ?? center.lng;
  const name = place.displayName?.text ?? "Distributore";
  const hoursText = [
    ...(place.currentOpeningHours?.weekdayDescriptions ?? []),
    ...(place.regularOpeningHours?.weekdayDescriptions ?? []),
  ].join(" ");
  const phone =
    place.nationalPhoneNumber || place.internationalPhoneNumber || undefined;

  const adblueMention =
    opts?.adblueFromQuery ||
    textMentionsAdBlue(name, place.formattedAddress, place.websiteUri);
  const open24h = textMentions24h(hoursText, name);

  const notes: string[] = [];
  if (adblueMention) notes.push("AdBlue segnalato");
  if (open24h) notes.push("Aperto 24 ore su 24 secondo la scheda del distributore");

  return {
    id: `ggl-fuel-${place.id ?? `${lat},${lng}`}`,
    name,
    location: { lat, lng },
    address: place.formattedAddress,
    distanceMeters: withDistance({ lat, lng }, center),
    phone,
    website: place.websiteUri,
    mapsUrl: place.googleMapsUri ?? mapsSearchUrl(lat, lng, name),
    openNow: place.currentOpeningHours?.openNow,
    openingHours: hoursText || undefined,
    rating: place.rating,
    sources: ["google_maps"],
    amenities: {
      adblue: adblueMention ? "yes" : "unknown",
      open24h: open24h ? "yes" : "unknown",
    },
    notes,
    verifyByPhone: true,
  };
}
