import type { ComputedRoute } from "@/lib/types/route";
import type { LatLng } from "@/lib/types/trip";
import { decodePolyline, haversineMeters } from "@/lib/utils/geometry";
import type { NavManeuver } from "@/lib/navigation/types";
import { pathCumulativeMeters } from "@/lib/navigation/geometry-nav";

/**
 * Flatten route legs/steps into navigation maneuvers with positions along the path.
 */
export function buildManeuvers(route: ComputedRoute): NavManeuver[] {
  const path = route.decodedPath;
  const cum = pathCumulativeMeters(path);
  const total = cum[cum.length - 1] || route.distanceMeters || 1;
  const maneuvers: NavManeuver[] = [];
  let offset = 0;

  for (const leg of route.legs) {
    for (const step of leg.steps) {
      let location: LatLng;
      if (step.polyline) {
        const pts = decodePolyline(step.polyline);
        location = pts[0] ?? path[0] ?? { lat: 0, lng: 0 };
      } else if (path.length > 0) {
        location = pointAtDistance(path, cum, offset);
      } else {
        location = { lat: 0, lng: 0 };
      }

      maneuvers.push({
        id: step.id,
        instruction: stripHtml(step.instruction) || "Prosegui",
        distanceMeters: step.distanceMeters,
        durationSeconds: step.durationSeconds,
        startOffsetMeters: offset,
        location,
      });
      offset += Math.max(0, step.distanceMeters);
    }
  }

  // Fallback when Google/demo returns no steps: synthesize coarse cues.
  if (maneuvers.length === 0 && path.length >= 2) {
    const mid = Math.floor(path.length / 2);
    maneuvers.push({
      id: "synth-start",
      instruction: "Parti e segui il percorso Itinera",
      distanceMeters: total * 0.5,
      durationSeconds: (route.durationSeconds || 0) * 0.5,
      startOffsetMeters: 0,
      location: path[0],
    });
    maneuvers.push({
      id: "synth-mid",
      instruction: "Continua sul percorso calcolato",
      distanceMeters: total * 0.5,
      durationSeconds: (route.durationSeconds || 0) * 0.5,
      startOffsetMeters: total * 0.5,
      location: path[mid],
    });
  }

  // Ensure last cue is arrival near destination
  if (path.length > 0) {
    const dest = path[path.length - 1];
    const last = maneuvers[maneuvers.length - 1];
    if (!last || haversineMeters(last.location, dest) > 80) {
      maneuvers.push({
        id: "arrival",
        instruction: "Sei arrivato a destinazione",
        distanceMeters: 0,
        durationSeconds: 0,
        startOffsetMeters: total,
        location: dest,
      });
    } else {
      last.instruction = /arriv/i.test(last.instruction)
        ? last.instruction
        : `${last.instruction} — poi arrivo`;
    }
  }

  return maneuvers;
}

function pointAtDistance(
  path: LatLng[],
  cum: number[],
  target: number,
): LatLng {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (target <= 0) return path[0];
  const total = cum[cum.length - 1];
  if (target >= total) return path[path.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  const a = path[i - 1];
  const b = path[i];
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? (target - cum[i - 1]) / seg : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findCurrentManeuverIndex(
  maneuvers: NavManeuver[],
  traveledMeters: number,
): number {
  if (maneuvers.length === 0) return 0;
  // Active cue = first maneuver whose end we have not yet passed.
  for (let i = 0; i < maneuvers.length; i++) {
    const end =
      maneuvers[i].startOffsetMeters + Math.max(0, maneuvers[i].distanceMeters);
    if (traveledMeters < end - 15) return i;
  }
  return maneuvers.length - 1;
}
