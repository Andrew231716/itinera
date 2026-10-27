import type { LatLng } from "@/lib/types/trip";
import {
  parseMaxspeedKmh,
  type NavAlert,
  type NavAlertKind,
} from "@/lib/navigation/alerts";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export interface OverpassAlertResult {
  alerts: NavAlert[];
  speedLimitSamples: Array<{ location: LatLng; maxspeedKmh: number }>;
}

type OsmTags = Record<string, string>;

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

function elementLocation(el: OsmElement): LatLng | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
  if (el.center?.lat != null && el.center?.lon != null) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function classifyCamera(tags: OsmTags): {
  kind: NavAlertKind;
  label: string;
} | null {
  const enforcement = (tags.enforcement ?? "").toLowerCase();
  const highway = (tags.highway ?? "").toLowerCase();
  const cameraType = (tags["camera:type"] ?? "").toLowerCase();

  if (
    enforcement === "traffic_signals" ||
    cameraType.includes("traffic_signal") ||
    cameraType.includes("red_light")
  ) {
    return {
      kind: "traffic_light_camera",
      label: "Controllo semaforico",
    };
  }
  if (
    enforcement === "average_speed" ||
    tags["speed_camera:type"] === "section" ||
    /tutor|section/i.test(tags.name ?? "")
  ) {
    return {
      kind: "average_speed",
      label: "Tutor / velocità media",
    };
  }
  if (enforcement === "check" || highway === "speed_display") {
    return { kind: "speed_check", label: "Controllo velocità" };
  }
  if (highway === "speed_camera" || enforcement === "maxspeed") {
    return { kind: "speed_camera", label: "Autovelox" };
  }
  return null;
}

function isRoadworks(tags: OsmTags): boolean {
  if (tags.highway === "construction") return true;
  if (tags.roadworks === "yes") return true;
  if (tags.hazard === "roadworks") return true;
  if (tags.construction && tags.construction !== "no") return true;
  if (/lavori|cantiere|road.?work/i.test(tags.note ?? "")) return true;
  return false;
}

export function buildOverpassQuery(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `
[out:json][timeout:22];
(
  node["highway"="speed_camera"](${b});
  node["enforcement"~"maxspeed|traffic_signals|check|average_speed"](${b});
  node["camera:type"~"speed|traffic_signal|red_light",i](${b});
  node["highway"="speed_display"](${b});
  node["hazard"="roadworks"](${b});
  node["highway"="construction"](${b});
  way["highway"="construction"](${b});
  way["roadworks"="yes"](${b});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"]["maxspeed"](${b});
);
out center tags;
`.trim();
}

export function parseOverpassAlerts(elements: OsmElement[]): OverpassAlertResult {
  const alerts: NavAlert[] = [];
  const speedLimitSamples: Array<{ location: LatLng; maxspeedKmh: number }> =
    [];
  const seen = new Set<string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const loc = elementLocation(el);
    if (!loc) continue;

    const maxspeedKmh = parseMaxspeedKmh(tags.maxspeed);

    if (el.type === "way" && tags.maxspeed && tags.highway !== "construction") {
      if (maxspeedKmh != null) {
        speedLimitSamples.push({ location: loc, maxspeedKmh });
      }
    }

    if (isRoadworks(tags)) {
      const id = `rw-${el.type}-${el.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        alerts.push({
          id,
          kind: "roadworks",
          label: tags.name || tags.note || "Lavori in corso",
          location: loc,
          maxspeedKmh,
          routeOffsetMeters: null,
        });
      }
      continue;
    }

    const cam = classifyCamera(tags);
    if (cam) {
      const id = `cam-${el.type}-${el.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        alerts.push({
          id,
          kind: cam.kind,
          label: tags.name || cam.label,
          location: loc,
          maxspeedKmh,
          routeOffsetMeters: null,
        });
      }
    }
  }

  return { alerts, speedLimitSamples };
}

export async function fetchOverpassAlerts(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<OverpassAlertResult> {
  const query = buildOverpassQuery(bbox);
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(24_000),
      });
      if (!res.ok) {
        lastError = new Error(`Overpass HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[] };
      return parseOverpassAlerts(data.elements ?? []);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Overpass non disponibile");
}
