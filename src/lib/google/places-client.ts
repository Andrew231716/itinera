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
