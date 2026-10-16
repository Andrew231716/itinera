import type { LatLng } from "@/lib/types/trip";
import type { FuelPriceQuote, FuelStation } from "@/lib/fuel/types";
import { normalizeBrandKey } from "@/lib/fuel/brands";
import {
  mapsSearchUrl,
  pickHighlightPrices,
  withDistance,
} from "@/lib/fuel/helpers";

const ZONE_URL = "https://carburanti.mise.gov.it/ospzApi/search/zone";
const ROUTE_URL = "https://carburanti.mise.gov.it/ospzApi/search/route";

interface OspzFuel {
  id?: number;
  price?: number;
  name?: string;
  fuelId?: number;
  isSelf?: boolean;
}

interface OspzResult {
  id?: number;
  name?: string;
  brand?: string;
  address?: string | null;
  insertDate?: string;
  distance?: string | number | null;
  location?: { lat?: number; lng?: number };
  fuels?: OspzFuel[];
}

/**
 * Official Osservaprezzi Carburanti (MIMIT) — live prices near a point or along a path.
 * Radius is expressed in km on the public API.
 */
export async function searchOsservaprezzi(params: {
  center: LatLng;
  radiusMeters: number;
  alongTo?: LatLng;
}): Promise<{ stations: FuelStation[]; error?: string }> {
  const radiusKm = Math.min(
    Math.max(params.radiusMeters / 1000, 1),
    20,
  );
  const points = params.alongTo
    ? [params.center, params.alongTo]
    : [params.center];
  const url = params.alongTo ? ROUTE_URL : ZONE_URL;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "ItineraFuel/1.0 (https://github.com/Andrew231716/itinera)",
      },
      body: JSON.stringify({
        points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
        radius: radiusKm,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return { stations: [], error: `Osservaprezzi HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      success?: boolean;
      results?: OspzResult[];
    };
    if (!data.success && !data.results?.length) {
      return { stations: [], error: "Osservaprezzi senza risultati" };
    }
    const stations = (data.results ?? [])
      .map((r) => ospzToStation(r, params.center))
      .filter((s): s is FuelStation => Boolean(s));
    return { stations };
  } catch (err) {
    return {
      stations: [],
      error:
        err instanceof Error ? err.message : "Osservaprezzi non disponibile",
    };
  }
}

function ospzToStation(
  result: OspzResult,
  center: LatLng,
): FuelStation | null {
  const lat = result.location?.lat;
  const lng = result.location?.lng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const brand = result.brand?.trim() || undefined;
  const name = result.name?.trim() || brand || "Distributore";
  const brandKey = normalizeBrandKey(brand, name);
  const prices = toPriceQuotes(result.fuels ?? [], result.insertDate);
  const hasDiesel = prices.some((p) => /gasolio|diesel/i.test(p.fuel));
  const hasPetrol = prices.some((p) => /benzina/i.test(p.fuel));
  const hasLpg = prices.some((p) => /gpl/i.test(p.fuel));
  const hasCng = prices.some((p) => /metano|gnc|gnl/i.test(p.fuel));

  const notes: string[] = [];
  if (prices.length) {
    const highlight = pickHighlightPrices(prices);
    if (highlight.length) {
      notes.push(
        `Prezzi MIMIT: ${highlight
          .map((p) => `${p.fuel} ${p.price.toFixed(3)} €/L${p.isSelf ? " (self)" : ""}`)
          .join(" · ")}`,
      );
    }
  }

  const distRaw =
    typeof result.distance === "string"
      ? Number.parseFloat(result.distance)
      : typeof result.distance === "number"
        ? result.distance
        : NaN;
  const distanceMeters = Number.isFinite(distRaw)
    ? Math.round(distRaw * 1000)
    : withDistance({ lat, lng }, center);

  return {
    id: `ospz-${result.id ?? `${lat},${lng}`}`,
    name: brand && !name.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} – ${name}`
      : name,
    brand,
    brandKey,
    location: { lat, lng },
    address: result.address?.trim() || undefined,
    distanceMeters,
    mapsUrl: mapsSearchUrl(lat, lng, name),
    sources: ["osservaprezzi"],
    amenities: {
      diesel: hasDiesel ? "yes" : "unknown",
      petrol: hasPetrol ? "yes" : "unknown",
      lpg: hasLpg ? "yes" : "unknown",
      cng: hasCng ? "yes" : "unknown",
    },
    prices,
    notes,
    verifyByPhone: false,
  };
}

function toPriceQuotes(
  fuels: OspzFuel[],
  insertDate?: string,
): FuelPriceQuote[] {
  const quotes: FuelPriceQuote[] = [];
  for (const f of fuels) {
    const price = Number(f.price);
    const fuel = (f.name ?? "").trim();
    if (!fuel || !Number.isFinite(price) || price <= 0) continue;
    quotes.push({
      fuel,
      price,
      isSelf: Boolean(f.isSelf),
      updatedAt: insertDate,
    });
  }
  // Prefer self-service when both exist for same product
  quotes.sort((a, b) => {
    if (a.fuel !== b.fuel) return a.fuel.localeCompare(b.fuel);
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.price - b.price;
  });
  return quotes;
}
