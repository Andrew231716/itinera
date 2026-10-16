import type { LatLng } from "@/lib/types/trip";

export type FuelSource =
  | "google_maps"
  | "openstreetmap"
  | "osservaprezzi"
  | "brand";

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

export interface FuelPriceQuote {
  /** Product label from Osservaprezzi (e.g. Benzina, Gasolio, GPL) */
  fuel: string;
  /** EUR / liter */
  price: number;
  /** Self-service pump when true */
  isSelf: boolean;
  /** Last reported update ISO if known */
  updatedAt?: string;
}

export interface FuelStation {
  id: string;
  name: string;
  brand?: string;
  /** Normalized brand key for filtering (eni, q8, shell, …) */
  brandKey?: string;
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
  /** Official prices from Osservaprezzi Carburanti (MIMIT) when available */
  prices?: FuelPriceQuote[];
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
    brand?: string;
  };
  stations: FuelStation[];
  /** Distinct brands found (normalized keys + labels) for UI filters */
  brandsAvailable: Array<{ key: string; label: string; count: number }>;
  sourcesUsed: FuelSource[];
  limitations: string[];
  advice?: string;
  fetchedAt: string;
}

/** Common Italian retail brands for filter chips */
export const KNOWN_FUEL_BRANDS: Array<{ key: string; label: string }> = [
  { key: "q8", label: "Q8" },
  { key: "eni", label: "Eni" },
  { key: "esso", label: "Esso" },
  { key: "ip", label: "IP" },
  { key: "shell", label: "Shell" },
  { key: "tamoil", label: "Tamoil" },
  { key: "total", label: "TotalEnergies" },
  { key: "beyfin", label: "Beyfin" },
  { key: "pompebianche", label: "Pompe Bianche" },
];
