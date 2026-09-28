import { haversineMeters } from "@/lib/utils/geometry";
import type { LatLng } from "@/lib/types/trip";
import type { ParkingSpot } from "@/lib/parking/types";
import {
  EASYPARK_FEES_PDF_IT,
  EASYPARK_HELP_CITIES_IT,
  EASYPARK_HOME_IT,
  type EasyParkInfo,
  type ParkingPricing,
} from "@/lib/parking/types";

export function mapsSearchUrl(lat: number, lng: number, label?: string): string {
  const q = label
    ? encodeURIComponent(`${label} @${lat},${lng}`)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function easyParkPublicSearch(params: {
  lat: number;
  lng: number;
  label?: string;
}): EasyParkInfo {
  const { lat, lng, label } = params;
  // Free public search: Google Maps query for EasyPark near the spot + official docs.
  // No partner/commercial EasyPark API.
  const mapsQ = encodeURIComponent(
    `EasyPark parcheggio ${label ?? ""} ${lat.toFixed(5)},${lng.toFixed(5)}`.trim(),
  );
  return {
    available: true,
    searchUrl: `https://www.google.com/maps/search/?api=1&query=${mapsQ}`,
    feesDocumentUrl: EASYPARK_FEES_PDF_IT,
    note:
      "Ricerca gratuita (senza API EasyPark a pagamento). Apri la ricerca Maps o il PDF ufficiale commissioni; conferma codice area e tariffa nell’app EasyPark.",
  };
}

export function easyParkPortalLinks() {
  return {
    home: EASYPARK_HOME_IT,
    citiesAndFees: EASYPARK_HELP_CITIES_IT,
    feesPdf: EASYPARK_FEES_PDF_IT,
  };
}

/** Detect EasyPark hints from free-text tags / names. */
export function mentionsEasyPark(...parts: Array<string | undefined | null>): boolean {
  return parts.some((p) => /easy\s*park|easypark/i.test(p ?? ""));
}

export function classifyFee(tags: {
  fee?: string;
  charge?: string;
  parking?: string;
  access?: string;
}): { pricing: ParkingPricing; summary?: string; raw?: string } {
  const fee = (tags.fee ?? "").trim().toLowerCase();
  const charge = (tags.charge ?? "").trim();
  const access = (tags.access ?? "").trim().toLowerCase();

  if (access === "private" || access === "no") {
    return { pricing: "unknown", summary: "Accesso ristretto", raw: access };
  }

  if (
    fee === "no" ||
    fee === "free" ||
    fee === "none" ||
    /gratis|gratuito|senza\s*pagamento/.test(fee)
  ) {
    return { pricing: "free", summary: "Gratuito", raw: tags.fee };
  }

  if (fee === "yes" || fee === "customers" || charge) {
    const summary = charge
      ? normalizeChargeText(charge)
      : "A pagamento";
    return {
      pricing: "paid",
      summary,
      raw: [tags.fee, charge].filter(Boolean).join(" · ") || undefined,
    };
  }

  return { pricing: "unknown", summary: "Tariffa non indicata" };
}

function normalizeChargeText(charge: string): string {
  const c = charge.trim();
  if (!c) return "A pagamento";
  // Keep OSM charge strings readable (often "2€/h" or Italian prose)
  if (/€|eur|\/h|ora|hour|min/i.test(c)) return c;
  return `A pagamento: ${c}`;
}

export function sortByDistance(spots: ParkingSpot[]): ParkingSpot[] {
  return [...spots].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function withDistance(
  location: LatLng,
  center: LatLng,
): number {
  return Math.round(haversineMeters(center, location));
}

export function mergeSpots(spots: ParkingSpot[]): ParkingSpot[] {
  const byKey = new Map<string, ParkingSpot>();
  for (const spot of spots) {
    const key = `${spot.location.lat.toFixed(5)},${spot.location.lng.toFixed(5)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, spot);
      continue;
    }
    const sources = Array.from(
      new Set([...existing.sources, ...spot.sources]),
    );
    byKey.set(key, {
      ...existing,
      ...spot,
      name:
        existing.name.length >= spot.name.length ? existing.name : spot.name,
      sources,
      pricing:
        existing.pricing !== "unknown"
          ? existing.pricing
          : spot.pricing,
      cost: existing.cost?.raw || existing.cost?.summary
        ? existing.cost
        : spot.cost,
      easyPark: existing.easyPark?.available
        ? existing.easyPark
        : spot.easyPark,
      rating: existing.rating ?? spot.rating,
      openNow: existing.openNow ?? spot.openNow,
      website: existing.website ?? spot.website,
      capacity: existing.capacity ?? spot.capacity,
      notes: Array.from(
        new Set([...(existing.notes ?? []), ...(spot.notes ?? [])]),
      ),
    });
  }
  return sortByDistance(Array.from(byKey.values()));
}
