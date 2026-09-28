import type { LatLng } from "@/lib/types/trip";

export type ParkingSource =
  | "google_maps"
  | "openstreetmap"
  | "easypark"
  | "official";

export type ParkingPricing = "free" | "paid" | "unknown";

export interface ParkingCostDetail {
  /** Short label shown in UI, e.g. "a pagamento" or "2,50 €/ora" */
  summary: string;
  /** Raw OSM/Google snippets when available */
  raw?: string;
  /** Currency ISO if a numeric amount was parsed */
  currency?: string;
  /** Approximate hourly rate when parseable */
  hourlyEstimate?: number;
  /** Link to an official tariff document */
  documentUrl?: string;
  documentLabel?: string;
}

export interface EasyParkInfo {
  /** True when this spot can be paid / found via EasyPark */
  available: boolean;
  /** Free public search / deep-link (no partner API) */
  searchUrl: string;
  /** Official EasyPark service-fee PDF for Italy */
  feesDocumentUrl: string;
  note: string;
}

export interface ParkingSpot {
  id: string;
  name: string;
  location: LatLng;
  address?: string;
  distanceMeters: number;
  pricing: ParkingPricing;
  cost?: ParkingCostDetail;
  capacity?: number;
  parkingType?: string;
  operator?: string;
  sources: ParkingSource[];
  easyPark?: EasyParkInfo;
  mapsUrl: string;
  website?: string;
  openNow?: boolean;
  rating?: number;
  notes?: string[];
}

export interface ParkingSearchResult {
  center: LatLng;
  radiusMeters: number;
  query?: string;
  spots: ParkingSpot[];
  sourcesUsed: ParkingSource[];
  limitations: string[];
  fetchedAt: string;
}

export const EASYPARK_FEES_PDF_IT =
  "https://a.storyblok.com/f/167931/x/8c9b6eef40/costi-di-commissione-20251205.pdf";

export const EASYPARK_HELP_CITIES_IT =
  "https://www.easypark.com/it-it/assistenza/parcheggio/comuni-attivi-e-commissioni-citta-attive-e-commissioni-di-servizio--28441743496604";

export const EASYPARK_HOME_IT = "https://www.easypark.com/it-it";
