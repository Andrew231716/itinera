import type { LatLng } from "@/lib/types/trip";

export type FuelSource = "google_maps" | "openstreetmap" | "brand";

export type FuelAmenityKey =
  | "adblue"
  | "diesel"
  | "petrol"
  | "lpg"
  | "cng"
  | "electric"
  | "truck"
  | "open24h";

export type AmenitySignal = "yes" | "no" | "unknown";

export interface FuelStation {
  id: string;
  name: string;
  brand?: string;
  location: LatLng;
  address?: string;
  distanceMeters: number;
  phone?: string;
  website?: string;
  mapsUrl: string;
  openNow?: boolean;
  openingHours?: string;
  rating?: number;
  sources: FuelSource[];
  amenities: Partial<Record<FuelAmenityKey, AmenitySignal>>;
  /** Short human notes (e.g. "AdBlue segnalato su OSM") */
  notes: string[];
  /** Recommend calling to confirm live dispenser status */
  verifyByPhone: boolean;
}

export interface FuelSearchResult {
  center: LatLng;
  radiusMeters: number;
  query?: string;
  filters: {
    adblue?: boolean;
    open24h?: boolean;
    truck?: boolean;
  };
  stations: FuelStation[];
  sourcesUsed: FuelSource[];
  limitations: string[];
  advice?: string;
  fetchedAt: string;
}
