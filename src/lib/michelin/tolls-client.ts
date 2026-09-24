import type { LatLng } from "@/lib/types/trip";

const MICHELIN_BFF_URL = "https://bff.viamichelin.com/graphql";

const SEARCH_ITINERARY_QUERY = `
query SearchItinerary($input: SearchItineraryInput!) {
  searchItinerary(input: $input) {
    __typename
    ... on SearchItinerarySuccessResult {
      type
      routes {
        identifier
        summary
        duration
        routeDistance { value unit }
        costs {
          tolls { amount currency }
          fuel { amount currency }
          vignette { amount currency }
        }
        totalCost { amount currency }
        tolls { name cost { amount currency } seasonalUrl }
        vignettes { name message cost { amount currency } }
        types
      }
    }
    ... on SearchItineraryNotFoundResult {
      __typename
    }
  }
}
`;

export interface MichelinMoney {
  amount: number;
  currencyCode: string;
}

export interface MichelinTollBarrier {
  name: string;
  cost?: MichelinMoney;
  seasonalUrl?: string | null;
}

export interface MichelinVignette {
  name: string;
  message?: string | null;
  cost?: MichelinMoney;
}

export interface MichelinRouteTolls {
  summary?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  types?: string[];
  tolls?: MichelinMoney;
  fuel?: MichelinMoney;
  vignette?: MichelinMoney;
  totalCost?: MichelinMoney;
  barriers: MichelinTollBarrier[];
  vignettes: MichelinVignette[];
}

export interface MichelinTollsResult {
  routes: MichelinRouteTolls[];
  sourceUrl: string;
}

export type MichelinConstraint = "NONE" | "NO_TOLL" | "NO_MOTORWAY";

function money(
  raw: { amount?: number; currency?: string } | null | undefined,
): MichelinMoney | undefined {
  if (!raw || typeof raw.amount !== "number" || Number.isNaN(raw.amount)) {
    return undefined;
  }
  return {
    amount: raw.amount,
    currencyCode: (raw.currency ?? "EUR").toUpperCase(),
  };
}

function distanceToMeters(
  value: number | undefined,
  unit: string | undefined,
): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  const u = (unit ?? "KILOMETER").toUpperCase();
  if (u.startsWith("MILE")) return Math.round(value * 1609.344);
  if (u.startsWith("METER") && !u.startsWith("KILO")) return Math.round(value);
  return Math.round(value * 1000);
}

/** Michelin durations arrive as milliseconds. */
function durationToSeconds(raw: number | null | undefined): number | undefined {
  if (raw == null || Number.isNaN(raw) || raw <= 0) return undefined;
  return Math.round(raw / 1000);
}

export async function fetchMichelinRouteTolls(options: {
  points: LatLng[];
  departureName?: string;
  arrivalName?: string;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  signal?: AbortSignal;
}): Promise<MichelinTollsResult | null> {
  if (options.points.length < 2) return null;

  let constraint: MichelinConstraint = "NONE";
  if (options.avoidTolls) constraint = "NO_TOLL";
  else if (options.avoidHighways) constraint = "NO_MOTORWAY";

  const input = {
    coordinates: options.points.map((p) => ({ lat: p.lat, lng: p.lng })),
    departureName: options.departureName ?? undefined,
    arrivalName: options.arrivalName ?? undefined,
    currency: "eur",
    distanceSystem: "METRIC",
    mode: "CAR",
    traffic: "NONE",
    constraint,
    withCaravan: false,
    withElectricVehicle: false,
    device: "DESKTOP",
  };

  const res = await fetch(MICHELIN_BFF_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.viamichelin.it",
      Referer: "https://www.viamichelin.it/",
      "Accept-Language": "it-IT,it;q=0.9",
    },
    body: JSON.stringify({
      query: SEARCH_ITINERARY_QUERY,
      variables: { input },
    }),
    signal: options.signal,
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  const payload = (await res.json()) as {
    data?: {
      searchItinerary?: {
        __typename?: string;
        routes?: Array<Record<string, unknown>>;
      };
    };
    errors?: unknown;
  };

  const result = payload.data?.searchItinerary;
  if (!result || result.__typename !== "SearchItinerarySuccessResult") {
    return null;
  }

  const routes: MichelinRouteTolls[] = (result.routes ?? []).map((route) => {
    const costs = route.costs as
      | {
          tolls?: { amount?: number; currency?: string };
          fuel?: { amount?: number; currency?: string };
          vignette?: { amount?: number; currency?: string };
        }
      | undefined;
    const routeDistance = route.routeDistance as
      | { value?: number; unit?: string }
      | undefined;
    const barriersRaw = (route.tolls as Array<Record<string, unknown>> | undefined) ?? [];
    const vignettesRaw =
      (route.vignettes as Array<Record<string, unknown>> | undefined) ?? [];

    return {
      summary: typeof route.summary === "string" ? route.summary : undefined,
      distanceMeters: distanceToMeters(routeDistance?.value, routeDistance?.unit),
      durationSeconds: durationToSeconds(
        typeof route.duration === "number" ? route.duration : undefined,
      ),
      types: Array.isArray(route.types)
        ? route.types.filter((t): t is string => typeof t === "string")
        : undefined,
      tolls: money(costs?.tolls),
      fuel: money(costs?.fuel),
      vignette: money(costs?.vignette),
      totalCost: money(
        route.totalCost as { amount?: number; currency?: string } | undefined,
      ),
      barriers: barriersRaw.map((b) => ({
        name: typeof b.name === "string" ? b.name : "Pedaggio",
        cost: money(b.cost as { amount?: number; currency?: string } | undefined),
        seasonalUrl:
          typeof b.seasonalUrl === "string" ? b.seasonalUrl : null,
      })),
      vignettes: vignettesRaw.map((v) => ({
        name: typeof v.name === "string" ? v.name : "Vignetta / pedaggio urbano",
        message: typeof v.message === "string" ? v.message : null,
        cost: money(v.cost as { amount?: number; currency?: string } | undefined),
      })),
    };
  });

  const from = options.points[0];
  const to = options.points[options.points.length - 1];
  const sourceUrl = `https://www.viamichelin.it/itinerari`;

  return {
    routes,
    sourceUrl:
      from && to
        ? `${sourceUrl}?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`
        : sourceUrl,
  };
}
