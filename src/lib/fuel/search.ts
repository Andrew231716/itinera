import { getServerGoogleMapsKey } from "@/lib/config/env";
import { searchGoogleFuel } from "@/lib/fuel/google-fuel";
import { searchOsmFuel } from "@/lib/fuel/osm-fuel";
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

  const searchRadius = alongTo ? Math.max(radiusMeters, 6000) : radiusMeters;

  const osmResults = await Promise.all(
    centers.map((c) =>
      searchOsmFuel({
        center: c,
        radiusMeters: searchRadius,
        preferAdBlue: filters.adblue,
      }),
    ),
  );

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

  const apiKey = getServerGoogleMapsKey();
  if (apiKey) {
    const gglResults = await Promise.all(
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
    for (const ggl of gglResults) {
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
  } else {
    limitations.push(
      "GOOGLE_MAPS_API_KEY assente: risultati Google Maps non disponibili (resta OSM).",
    );
  }

  let stations = mergeStations(collected);
  let relaxedAdBlue = false;

  if (filters.adblue) {
    const confirmed = stations.filter((s) => s.amenities.adblue === "yes");
    if (confirmed.length > 0) {
      stations = confirmed;
    } else if (stations.length > 0) {
      // Keep nearby stations so the panel is never a dead end when OSM/Google
      // lack explicit AdBlue tags in the area.
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
    "La disponibilità AdBlue/erogatori è segnalata da OSM/schede pubbliche: conferma telefonando prima di fare affidamento.",
  );

  const adblueCount = stations.filter(
    (s) => s.amenities.adblue === "yes",
  ).length;
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
            }. Ti consiglio di telefonare prima: online risulta disponibile, ma non posso verificare che l’erogatore funzioni in questo momento.`
          : `Ho trovato ${stations.length} distributori${where}. Usa i filtri (AdBlue, H24) per restringere.`;

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
