import type { LatLng } from "@/lib/types/trip";
import { pathIntersectsPolygon } from "@/lib/utils/geometry";

export type MilanZoneId = "area_c" | "area_b";

export interface MilanZoneHit {
  id: MilanZoneId;
  label: string;
  kind: "ztl" | "traffic_limited";
  message: string;
}

/**
 * Approximate Cerchia dei Bastioni / Area C (ZTL storica di Milano).
 * Polygon semplificato a scopo informativo — non ufficiale.
 */
export const MILAN_AREA_C: LatLng[] = [
  { lat: 45.4808, lng: 9.2055 },
  { lat: 45.4838, lng: 9.1895 },
  { lat: 45.4815, lng: 9.1715 },
  { lat: 45.4728, lng: 9.1638 },
  { lat: 45.4615, lng: 9.1625 },
  { lat: 45.4518, lng: 9.1695 },
  { lat: 45.4485, lng: 9.1855 },
  { lat: 45.4498, lng: 9.2025 },
  { lat: 45.4585, lng: 9.2115 },
  { lat: 45.4695, lng: 9.2135 },
];

/**
 * Approximate Area B (fascia più ampia di limitazione traffico Milano).
 * Polygon semplificato a scopo informativo — non ufficiale.
 */
export const MILAN_AREA_B: LatLng[] = [
  { lat: 45.512, lng: 9.23 },
  { lat: 45.518, lng: 9.19 },
  { lat: 45.512, lng: 9.145 },
  { lat: 45.49, lng: 9.12 },
  { lat: 45.46, lng: 9.11 },
  { lat: 45.43, lng: 9.13 },
  { lat: 45.42, lng: 9.17 },
  { lat: 45.425, lng: 9.22 },
  { lat: 45.45, lng: 9.25 },
  { lat: 45.485, lng: 9.25 },
];

/**
 * Detects whether a route geometry intersects Milan Area B / Area C.
 * Area C ⊂ Area B conceptually for warnings: report both distinctly.
 */
export function detectMilanTrafficZones(path: LatLng[]): MilanZoneHit[] {
  if (path.length < 2) return [];
  const hits: MilanZoneHit[] = [];

  const inC = pathIntersectsPolygon(path, MILAN_AREA_C);
  const inB = pathIntersectsPolygon(path, MILAN_AREA_B);

  if (inC) {
    hits.push({
      id: "area_c",
      label: "Milano Area C",
      kind: "ztl",
      message:
        "Il percorso entra in Milano Area C (ZTL Cerchia dei Bastioni). Serve permesso/ticket Area C nei giorni/orari di attivazione.",
    });
  }

  if (inB) {
    hits.push({
      id: "area_b",
      label: "Milano Area B",
      kind: "traffic_limited",
      message: inC
        ? "Il percorso interessa anche Milano Area B (limitazioni veicoli più inquinanti). Distinta da Area C."
        : "Il percorso entra in Milano Area B (zona a traffico limitato per veicoli più inquinanti). Non è la ZTL Area C.",
    });
  }

  return hits;
}
