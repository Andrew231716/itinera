import type { PlaceSuggestion } from "@/lib/types/route";
import type { LatLng, PlaceRef } from "@/lib/types/trip";
import { AppError } from "@/lib/utils/errors";

/** Curated Italian locations for demo mode — never presented as live routing. */
export const DEMO_PLACES: Array<{
  placeId: string;
  primaryText: string;
  secondaryText: string;
  location: LatLng;
}> = [
  {
    placeId: "demo-rozzano",
    primaryText: "Rozzano",
    secondaryText: "MI, Italia",
    location: { lat: 45.3819, lng: 9.1547 },
  },
  {
    placeId: "demo-milano",
    primaryText: "Milano",
    secondaryText: "MI, Italia",
    location: { lat: 45.4642, lng: 9.19 },
  },
  {
    placeId: "demo-firenze",
    primaryText: "Firenze",
    secondaryText: "FI, Italia",
    location: { lat: 43.7696, lng: 11.2558 },
  },
  {
    placeId: "demo-bologna",
    primaryText: "Bologna",
    secondaryText: "BO, Italia",
    location: { lat: 44.4949, lng: 11.3426 },
  },
  {
    placeId: "demo-roma",
    primaryText: "Roma",
    secondaryText: "RM, Italia",
    location: { lat: 41.9028, lng: 12.4964 },
  },
  {
    placeId: "demo-torino",
    primaryText: "Torino",
    secondaryText: "TO, Italia",
    location: { lat: 45.0703, lng: 7.6869 },
  },
  {
    placeId: "demo-genova",
    primaryText: "Genova",
    secondaryText: "GE, Italia",
    location: { lat: 44.4056, lng: 8.9463 },
  },
  {
    placeId: "demo-venezia",
    primaryText: "Venezia",
    secondaryText: "VE, Italia",
    location: { lat: 45.4408, lng: 12.3155 },
  },
  {
    placeId: "demo-napoli",
    primaryText: "Napoli",
    secondaryText: "NA, Italia",
    location: { lat: 40.8518, lng: 14.2681 },
  },
  {
    placeId: "demo-como",
    primaryText: "Como",
    secondaryText: "CO, Italia",
    location: { lat: 45.8081, lng: 9.0852 },
  },
];

export function searchDemoPlaces(query: string): PlaceSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return DEMO_PLACES.filter(
    (p) =>
      p.primaryText.toLowerCase().includes(q) ||
      p.secondaryText.toLowerCase().includes(q),
  ).map((p) => ({
    placeId: p.placeId,
    primaryText: p.primaryText,
    secondaryText: p.secondaryText,
    fullText: `${p.primaryText}, ${p.secondaryText}`,
    location: p.location,
    source: "demo" as const,
  }));
}

export function demoPlaceToRef(placeId: string): PlaceRef {
  const found = DEMO_PLACES.find((p) => p.placeId === placeId);
  if (!found) {
    throw new AppError("PLACE_NOT_FOUND", "Località demo non trovata.", 404);
  }
  return {
    id: found.placeId,
    label: found.primaryText,
    address: `${found.primaryText}, ${found.secondaryText}`,
    placeId: found.placeId,
    location: found.location,
    source: "demo",
  };
}

export async function autocompletePlaces(
  input: string,
  apiKey: string | undefined,
): Promise<{ mode: "live" | "demo"; suggestions: PlaceSuggestion[] }> {
  const q = input.trim();
  if (q.length < 2) {
    return { mode: apiKey ? "live" : "demo", suggestions: [] };
  }

  if (!apiKey) {
    return { mode: "demo", suggestions: searchDemoPlaces(q) };
  }

  const url = "https://places.googleapis.com/v1/places:autocomplete";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      input: q,
      languageCode: "it",
      includedRegionCodes: ["it"],
    }),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 429) {
      throw new AppError(
        "QUOTA",
        "Limite di utilizzo Places API raggiunto. Riprova più tardi.",
        429,
      );
    }
    throw new AppError(
      "PLACES_ERROR",
      "Impossibile completare la ricerca località.",
      status >= 500 ? 502 : 400,
    );
  }

  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  const suggestions: PlaceSuggestion[] = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      placeId: p!.placeId ?? "",
      primaryText:
        p!.structuredFormat?.mainText?.text ?? p!.text?.text ?? "Località",
      secondaryText: p!.structuredFormat?.secondaryText?.text,
      fullText: p!.text?.text ?? p!.structuredFormat?.mainText?.text ?? "",
      source: "google" as const,
    }))
    .filter((s) => s.placeId);

  return { mode: "live", suggestions };
}

export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string | undefined,
): Promise<{ mode: "live" | "demo"; place: PlaceRef }> {
  if (!apiKey || placeId.startsWith("demo-")) {
    return { mode: "demo", place: demoPlaceToRef(placeId) };
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location",
    },
  });

  if (!res.ok) {
    throw new AppError(
      "PLACE_DETAILS",
      "Dettagli località non disponibili.",
      res.status >= 500 ? 502 : 400,
    );
  }

  const data = (await res.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };

  if (
    data.location?.latitude === undefined ||
    data.location?.longitude === undefined
  ) {
    throw new AppError(
      "PLACE_NO_COORDS",
      "La località selezionata non ha coordinate utilizzabili.",
      422,
    );
  }

  return {
    mode: "live",
    place: {
      id: data.id ?? placeId,
      label: data.displayName?.text ?? data.formattedAddress ?? "Località",
      address: data.formattedAddress,
      placeId,
      location: {
        lat: data.location.latitude,
        lng: data.location.longitude,
      },
      source: "places",
    },
  };
}

/** Build a GPS place even without reverse geocoding (always usable for routing). */
export function placeFromCoordinates(
  lat: number,
  lng: number,
  opts?: { label?: string; address?: string; placeId?: string },
): PlaceRef {
  const roundedLat = Number(lat.toFixed(6));
  const roundedLng = Number(lng.toFixed(6));
  return {
    id: opts?.placeId ?? `gps-${roundedLat}-${roundedLng}`,
    label: opts?.label?.trim() || "Posizione attuale",
    address:
      opts?.address?.trim() ||
      `${roundedLat.toFixed(5)}, ${roundedLng.toFixed(5)}`,
    placeId: opts?.placeId,
    location: { lat: roundedLat, lng: roundedLng },
    source: "gps",
  };
}

/**
 * Reverse-geocode GPS coordinates.
 * Tries Geocoding API, then Places searchNearby; always returns a usable PlaceRef.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string | undefined,
): Promise<{ mode: "live" | "demo"; place: PlaceRef }> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new AppError("GPS_COORDS", "Coordinate GPS non valide.", 400);
  }

  if (!apiKey) {
    return { mode: "demo", place: placeFromCoordinates(lat, lng) };
  }

  // 1) Geocoding reverse (best address label)
  try {
    const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    geoUrl.searchParams.set("latlng", `${lat},${lng}`);
    geoUrl.searchParams.set("language", "it");
    geoUrl.searchParams.set("key", apiKey);
    const geoRes = await fetch(geoUrl.toString());
    if (geoRes.ok) {
      const geo = (await geoRes.json()) as {
        status?: string;
        results?: Array<{
          place_id?: string;
          formatted_address?: string;
          address_components?: Array<{
            long_name?: string;
            types?: string[];
          }>;
        }>;
      };
      if (geo.status === "OK" && geo.results?.[0]) {
        const top = geo.results[0];
        const street = top.address_components?.find((c) =>
          c.types?.includes("route"),
        )?.long_name;
        const locality =
          top.address_components?.find((c) =>
            c.types?.includes("locality"),
          )?.long_name ??
          top.address_components?.find((c) =>
            c.types?.includes("administrative_area_level_3"),
          )?.long_name;
        const label =
          [street, locality].filter(Boolean).join(", ") ||
          top.formatted_address?.split(",")[0]?.trim() ||
          "Posizione attuale";
        return {
          mode: "live",
          place: placeFromCoordinates(lat, lng, {
            label,
            address: top.formatted_address,
            placeId: top.place_id,
          }),
        };
      }
    }
  } catch {
    /* fall through */
  }

  // 2) Coordinates only — still valid for Routes / Maps links
  // (Geocoding API may be off on the project; we never invent a street name.)
  return { mode: "live", place: placeFromCoordinates(lat, lng) };
}
