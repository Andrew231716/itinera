import { getServerGoogleMapsKey } from "@/lib/config/env";
import { searchGoogleFuel } from "@/lib/fuel/google-fuel";
import { searchOsmFuel } from "@/lib/fuel/osm-fuel";
import { mergeStations, midpoint, withDistance } from "@/lib/fuel/helpers";
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
  };

  const limitations: string[] = [];
  const sourcesUsed: FuelSource[] = [];
  const collected: FuelStation[] = [];

  const centers: LatLng[] = [center];
  if (alongTo) {
    centers.push(midpoint(center, alongTo), alongTo);
  }

  for (const c of centers) {
    const osm = await searchOsmFuel({
      center: c,
      radiusMeters: alongTo ? Math.max(radiusMeters, 6000) : radiusMeters,
      preferAdBlue: filters.adblue,
    });
    if (osm.stations.length) {
      sourcesUsed.push("openstreetmap");
      collected.push(
        ...osm.stations.map((s) => ({
          ...s,
          distanceMeters: withDistance(s.location, center),
        })),
      );
    } else if (osm.error) {
      limitations.push(`OpenStreetMap: ${osm.error}`);
    }
  }

  const apiKey = getServerGoogleMapsKey();
  if (apiKey) {
    for (const c of centers) {
      const ggl = await searchGoogleFuel({
        center: c,
        radiusMeters: alongTo ? Math.max(radiusMeters, 6000) : radiusMeters,
        apiKey,
        query: params.query,
        preferAdBlue: filters.adblue,
      });
      if (ggl.stations.length) {
        sourcesUsed.push("google_maps");
        collected.push(
          ...ggl.stations.map((s) => ({
            ...s,
            distanceMeters: withDistance(s.location, center),
          })),
        );
      } else if (ggl.error) {
        limitations.push(`Google Maps: ${ggl.error}`);
      }
    }
  } else {
    limitations.push(
      "GOOGLE_MAPS_API_KEY assente: risultati Google Maps non disponibili (resta OSM).",
    );
  }

  let stations = mergeStations(collected);

  if (filters.adblue) {
    stations = stations.filter((s) => s.amenities.adblue === "yes");
  }
  if (filters.open24h) {
    stations = stations.filter((s) => s.amenities.open24h === "yes");
  }
  if (filters.truck) {
    stations = stations.filter((s) => s.amenities.truck === "yes");
  }

  stations = stations.slice(0, 40);

  limitations.push(
    "La disponibilità AdBlue/erogatori è segnalata da OSM/schede pubbliche: conferma telefonando prima di fare affidamento.",
  );

  const adblueCount = stations.filter(
    (s) => s.amenities.adblue === "yes",
  ).length;
  const advice =
    stations.length === 0
      ? filters.adblue
        ? "Nessun distributore con AdBlue segnalato in zona. Prova ad allargare il raggio o togliere il filtro."
        : "Nessun distributore trovato in questo raggio."
      : filters.adblue || adblueCount > 0
        ? `Ho trovato ${stations.length} opzioni${
            adblueCount ? ` (${adblueCount} con AdBlue segnalato)` : ""
          }. Ti consiglio di telefonare prima: online risulta disponibile, ma non posso verificare che l’erogatore funzioni in questo momento.`
        : `Ho trovato ${stations.length} distributori. Usa i filtri (AdBlue, H24) per restringere.`;

  return {
    center,
    radiusMeters,
    query: params.query,
    filters,
    stations,
    sourcesUsed: Array.from(new Set(sourcesUsed)),
    limitations: Array.from(new Set(limitations)),
    advice,
    fetchedAt: new Date().toISOString(),
  };
}
