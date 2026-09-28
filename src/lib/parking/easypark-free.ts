import type { LatLng } from "@/lib/types/trip";
import type { ParkingSpot } from "@/lib/parking/types";
import {
  EASYPARK_FEES_PDF_IT,
  EASYPARK_HELP_CITIES_IT,
} from "@/lib/parking/types";
import {
  easyParkPortalLinks,
  easyParkPublicSearch,
  mapsSearchUrl,
  withDistance,
} from "@/lib/parking/helpers";

/**
 * Free EasyPark discovery — no partner API keys.
 * Combines public Maps search links + official EasyPark fee documents.
 */
export function buildEasyParkFreeResults(params: {
  center: LatLng;
  label?: string;
}): { spots: ParkingSpot[]; limitations: string[] } {
  const { center, label } = params;
  const links = easyParkPortalLinks();
  const info = easyParkPublicSearch({
    lat: center.lat,
    lng: center.lng,
    label,
  });

  const hub: ParkingSpot = {
    id: `easypark-search-${center.lat.toFixed(4)}-${center.lng.toFixed(4)}`,
    name: label
      ? `Cerca EasyPark vicino a ${label}`
      : "Cerca aree EasyPark qui vicino",
    location: center,
    distanceMeters: 0,
    pricing: "paid",
    cost: {
      summary: "Commissioni EasyPark: vedi PDF ufficiale",
      documentUrl: EASYPARK_FEES_PDF_IT,
      documentLabel: "Costi di commissione EasyPark (PDF)",
    },
    sources: ["easypark", "official"],
    easyPark: info,
    mapsUrl: info.searchUrl,
    website: links.home,
    notes: [
      "Ricerca gratuita pubblica — nessuna API EasyPark commerciale.",
      "Conferma sempre codice area e tariffa comunale nell’app EasyPark prima di pagare.",
    ],
  };

  const docs: ParkingSpot = {
    id: "easypark-official-fees",
    name: "EasyPark — città attive e commissioni",
    location: center,
    distanceMeters: withDistance(center, center),
    pricing: "paid",
    cost: {
      summary: "Elenco ufficiale città / commissioni di servizio",
      documentUrl: EASYPARK_HELP_CITIES_IT,
      documentLabel: "Pagina ufficiale EasyPark",
    },
    sources: ["easypark", "official"],
    easyPark: {
      ...info,
      searchUrl: EASYPARK_HELP_CITIES_IT,
    },
    mapsUrl: mapsSearchUrl(center.lat, center.lng, "EasyPark"),
    website: EASYPARK_HELP_CITIES_IT,
    notes: [
      "Documento ufficiale EasyPark Italia (città attive + costi di servizio).",
    ],
  };

  return {
    spots: [hub, docs],
    limitations: [
      "EasyPark non offre un’API pubblica gratuita: mostriamo ricerca Maps + documenti ufficiali delle commissioni.",
    ],
  };
}
