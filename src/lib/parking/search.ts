import { getServerGoogleMapsKey } from "@/lib/config/env";
import { searchGoogleParking } from "@/lib/parking/google-parking";
import { searchOsmParking } from "@/lib/parking/osm-parking";
import { buildEasyParkFreeResults } from "@/lib/parking/easypark-free";
import {
  easyParkPublicSearch,
  mergeSpots,
} from "@/lib/parking/helpers";
import type {
  ParkingSearchResult,
  ParkingSource,
  ParkingSpot,
} from "@/lib/parking/types";
import type { LatLng } from "@/lib/types/trip";

export async function searchNearbyParking(params: {
  center: LatLng;
  radiusMeters?: number;
  query?: string;
  label?: string;
}): Promise<ParkingSearchResult> {
  const center = params.center;
  const radiusMeters = Math.min(
    Math.max(params.radiusMeters ?? 1200, 200),
    5000,
  );
  const limitations: string[] = [];
  const sourcesUsed: ParkingSource[] = [];
  const collected: ParkingSpot[] = [];

  const osm = await searchOsmParking({ center, radiusMeters });
  if (osm.spots.length) {
    sourcesUsed.push("openstreetmap");
    collected.push(...osm.spots);
  } else if (osm.error) {
    limitations.push(`OpenStreetMap: ${osm.error}`);
  }

  const apiKey = getServerGoogleMapsKey();
  if (apiKey) {
    const ggl = await searchGoogleParking({
      center,
      radiusMeters,
      apiKey,
      query: params.query,
    });
    if (ggl.spots.length) {
      sourcesUsed.push("google_maps");
      collected.push(...ggl.spots);
    } else if (ggl.error) {
      limitations.push(`Google Maps: ${ggl.error}`);
    }
  } else {
    limitations.push(
      "GOOGLE_MAPS_API_KEY assente: risultati Google Maps non disponibili (restano OSM + EasyPark gratuito).",
    );
  }

  const easy = buildEasyParkFreeResults({
    center,
    label: params.label ?? params.query,
  });
  sourcesUsed.push("easypark", "official");
  limitations.push(...easy.limitations);

  // Attach free EasyPark search action to every paid/unknown spot
  const enriched = collected.map((spot) => {
    if (spot.easyPark?.available) return spot;
    if (spot.pricing === "free") return spot;
    return {
      ...spot,
      easyPark: easyParkPublicSearch({
        lat: spot.location.lat,
        lng: spot.location.lng,
        label: spot.name,
      }),
    };
  });

  const spots = mergeSpots([...enriched, ...easy.spots]).slice(0, 60);

  if (!sourcesUsed.includes("openstreetmap") && osm.spots.length === 0) {
    limitations.push(
      "Dati OSM (fee/charge) usati come fonte open ufficiale per gratuito vs a pagamento.",
    );
  }

  return {
    center,
    radiusMeters,
    query: params.query,
    spots,
    sourcesUsed: Array.from(new Set(sourcesUsed)),
    limitations: Array.from(new Set(limitations)),
    fetchedAt: new Date().toISOString(),
  };
}
