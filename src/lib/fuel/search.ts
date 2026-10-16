import { getServerGoogleMapsKey } from "@/lib/config/env";
import { brandLabel, stationMatchesBrand } from "@/lib/fuel/brands";
import { searchGoogleFuel } from "@/lib/fuel/google-fuel";
import { searchOsmFuel } from "@/lib/fuel/osm-fuel";
import { searchOsservaprezzi } from "@/lib/fuel/osservaprezzi";
import {
  corridorDistance,
  mergeStations,
  midpoint,
  rankStations,
} from "@/lib/fuel/helpers";
import type { FuelSearchResult, FuelSource, FuelStation } from "@/lib/fuel/types";
import type { LatLng } from "@/lib/types/trip";

export async function searchNearbyFuel(params: {
  center: LatLng;
  radiusMeters?: number;
  query?: string;
  label?: string;
  /** Optional second point: search also along the corridor (origin→destination). */
  alongTo?: LatLng;
  adblue?: boolean;
  open24h?: boolean;
  truck?: boolean;
  brand?: string;
}): Promise<FuelSearchResult> {
  const center = params.center;
  const alongTo = params.alongTo;
  const radiusMeters = Math.min(
    Math.max(params.radiusMeters ?? (alongTo ? 8000 : 5000), 500),
    20000,
  );
  const filters = {
    adblue: Boolean(params.adblue),
    open24h: Boolean(params.open24h),
    truck: Boolean(params.truck),
    brand: params.brand?.trim().toLowerCase() || undefined,
  };

  const limitations: string[] = [];
  const sourcesUsed: FuelSource[] = [];
  const collected: FuelStation[] = [];

  const centers: LatLng[] = [center];
  if (alongTo) {
    centers.push(midpoint(center, alongTo), alongTo);
  }

  const searchRadius = alongTo ? Math.max(radiusMeters, 6000) : radiusMeters;

  const [osmResults, ospz, gglBundle] = await Promise.all([
    Promise.all(
      centers.map((c) =>
        searchOsmFuel({
          center: c,
          radiusMeters: searchRadius,
          preferAdBlue: filters.adblue,
        }),
      ),
    ),
    searchOsservaprezzi({
      center,
      radiusMeters: searchRadius,
      alongTo,
    }),
    (async () => {
      const apiKey = getServerGoogleMapsKey();
      if (!apiKey) {
        return {
          results: [] as Array<{ stations: FuelStation[]; error?: string }>,
          missingKey: true,
        };
      }
      const results = await Promise.all(
        centers.map((c) =>
          searchGoogleFuel({
            center: c,
            radiusMeters: searchRadius,
            apiKey,
            query: params.query,
            preferAdBlue: filters.adblue,
          }),
        ),
      );
      return { results, missingKey: false };
    })(),
  ]);

  for (const osm of osmResults) {
    if (osm.stations.length) {
      sourcesUsed.push("openstreetmap");
      collected.push(
        ...osm.stations.map((s) => ({
          ...s,
          distanceMeters: corridorDistance(s.location, centers),
        })),
      );
    } else if (osm.error) {
      limitations.push(`OpenStreetMap: ${osm.error}`);
    }
  }

  if (ospz.stations.length) {
    sourcesUsed.push("osservaprezzi");
    collected.push(
      ...ospz.stations.map((s) => ({
        ...s,
        distanceMeters: corridorDistance(s.location, centers),
      })),
    );
  } else if (ospz.error) {
    limitations.push(`Osservaprezzi MIMIT: ${ospz.error}`);
  }

  if (gglBundle.missingKey) {
    limitations.push(
      "GOOGLE_MAPS_API_KEY assente: risultati Google Maps non disponibili (restano OSM + Osservaprezzi).",
    );
  } else {
    for (const ggl of gglBundle.results) {
      if (ggl.stations.length) {
        sourcesUsed.push("google_maps");
        collected.push(
          ...ggl.stations.map((s) => ({
            ...s,
            distanceMeters: corridorDistance(s.location, centers),
          })),
        );
      } else if (ggl.error) {
        limitations.push(`Google Maps: ${ggl.error}`);
      }
    }
  }

  let stations = mergeStations(collected);
  let relaxedAdBlue = false;

  // Brand counts before brand filter (for UI chips)
  const brandCounts = new Map<string, number>();
  for (const s of stations) {
    const key = s.brandKey;
    if (!key) continue;
    brandCounts.set(key, (brandCounts.get(key) ?? 0) + 1);
  }
  const brandsAvailable = Array.from(brandCounts.entries())
    .map(([key, count]) => ({ key, label: brandLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  if (filters.brand) {
    stations = stations.filter((s) => stationMatchesBrand(s, filters.brand!));
  }

  if (params.query?.trim()) {
    const q = params.query.trim().toLowerCase();
    stations = stations.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.brand?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q),
    );
  }

  if (filters.adblue) {
    const confirmed = stations.filter((s) => s.amenities.adblue === "yes");
    if (confirmed.length > 0) {
      stations = confirmed;
    } else if (stations.length > 0) {
      relaxedAdBlue = true;
      limitations.push(
        "Nessun AdBlue esplicitamente confermato in zona: mostro i distributori più vicini da verificare telefonicamente.",
      );
    }
  }
  if (filters.open24h) {
    stations = stations.filter((s) => s.amenities.open24h === "yes");
  }
  if (filters.truck) {
    stations = stations.filter((s) => s.amenities.truck === "yes");
  }

  stations = rankStations(stations).slice(0, 40);

  limitations.push(
    "Prezzi da Osservaprezzi Carburanti (MIMIT); AdBlue da OSM/schede pubbliche. Conferma sempre in loco o telefonando.",
  );

  const adblueCount = stations.filter(
    (s) => s.amenities.adblue === "yes",
  ).length;
  const withPrices = stations.filter((s) => (s.prices?.length ?? 0) > 0).length;
  const where = params.label?.trim()
    ? ` tra/vicino a ${params.label.trim()}`
    : "";
  const advice =
    stations.length === 0
      ? filters.adblue
        ? `Nessun distributore con AdBlue segnalato${where}. Prova ad allargare il raggio o togliere il filtro.`
        : `Nessun distributore trovato${where || " in questo raggio"}.`
      : relaxedAdBlue
        ? `Ho trovato ${stations.length} distributori${where}, ma nessuno con AdBlue confermato online. Ti consiglio di telefonare prima di fare rifornimento.`
        : filters.adblue || adblueCount > 0
          ? `Ho trovato ${stations.length} opzioni interessanti${where}${
              adblueCount ? ` (${adblueCount} con AdBlue segnalato)` : ""
            }${withPrices ? `, ${withPrices} con prezzi MIMIT` : ""}. Ti consiglio di telefonare prima: online risulta disponibile, ma non posso verificare che l’erogatore funzioni in questo momento.`
          : `Ho trovato ${stations.length} distributori${where}${
              withPrices ? ` (${withPrices} con prezzi MIMIT)` : ""
            }. Usa i filtri (AdBlue, brand, H24) per restringere.`;

  return {
    center,
    radiusMeters,
    query: params.query,
    filters,
    stations,
    brandsAvailable,
    sourcesUsed: Array.from(new Set(sourcesUsed)),
    limitations: Array.from(new Set(limitations)),
    advice,
    fetchedAt: new Date().toISOString(),
  };
}
