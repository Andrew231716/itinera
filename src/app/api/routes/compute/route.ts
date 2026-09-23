import { NextResponse } from "next/server";
import { getDefaultRoutingEngine } from "@/lib/routing/engines/types";
import type { RouteComputeRequest } from "@/lib/types/route";
import type { PlaceRef, RoadPreferences } from "@/lib/types/trip";
import { apiErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

function isLatLng(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as { lat?: unknown; lng?: unknown };
  return typeof v.lat === "number" && typeof v.lng === "number";
}

function isPlaceRef(value: unknown): value is PlaceRef {
  if (!value || typeof value !== "object") return false;
  const p = value as PlaceRef;
  return (
    typeof p.id === "string" &&
    typeof p.label === "string" &&
    isLatLng(p.location)
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      origin?: unknown;
      destination?: unknown;
      intermediates?: unknown;
      travelMode?: unknown;
      departureAt?: unknown;
      preferences?: Partial<RoadPreferences>;
      optimizeWaypointOrder?: unknown;
      exclusions?: unknown;
    };

    if (!isPlaceRef(body.origin) || !isPlaceRef(body.destination)) {
      throw new AppError(
        "VALIDATION",
        "Origine e destinazione sono obbligatorie.",
        400,
      );
    }

    const intermediates = Array.isArray(body.intermediates)
      ? body.intermediates.filter(isPlaceRef)
      : [];

    if (intermediates.length > 25) {
      throw new AppError(
        "VALIDATION",
        "Troppe tappe intermedie (massimo 25 per richiesta).",
        400,
      );
    }

    const preferences: RoadPreferences = {
      avoidTolls: Boolean(body.preferences?.avoidTolls),
      avoidHighways: Boolean(body.preferences?.avoidHighways),
      avoidFerries: Boolean(body.preferences?.avoidFerries),
      avoidTunnels: Boolean(body.preferences?.avoidTunnels),
      preferFastest: body.preferences?.preferFastest !== false,
      preferShortest: Boolean(body.preferences?.preferShortest),
      preferScenic: Boolean(body.preferences?.preferScenic),
      maxExtraMinutes:
        typeof body.preferences?.maxExtraMinutes === "number"
          ? body.preferences.maxExtraMinutes
          : null,
    };

    const computeRequest: RouteComputeRequest = {
      origin: body.origin,
      destination: body.destination,
      intermediates,
      travelMode:
        body.travelMode === "WALK" ||
        body.travelMode === "BICYCLE" ||
        body.travelMode === "TRANSIT" ||
        body.travelMode === "TWO_WHEELER"
          ? body.travelMode
          : "DRIVE",
      departureAt:
        typeof body.departureAt === "string" ? body.departureAt : null,
      preferences: {
        avoidTolls: preferences.avoidTolls,
        avoidHighways: preferences.avoidHighways,
        avoidFerries: preferences.avoidFerries,
        preferFastest: preferences.preferFastest,
        preferShortest: preferences.preferShortest,
      },
      optimizeWaypointOrder: Boolean(body.optimizeWaypointOrder),
      exclusions: Array.isArray(body.exclusions) ? body.exclusions : [],
    };

    const engine = getDefaultRoutingEngine();
    const result = await engine.compute(computeRequest, preferences);

    if (
      preferences.maxExtraMinutes != null &&
      result.routes.length > 0 &&
      result.mode === "live"
    ) {
      const baseline = result.routes[0].durationSeconds;
      const filtered = result.routes.filter(
        (r) =>
          r.durationSeconds <= baseline + preferences.maxExtraMinutes! * 60,
      );
      if (filtered.length < result.routes.length) {
        result.limitations.push(
          `Filtrate le alternative oltre +${preferences.maxExtraMinutes} minuti rispetto al percorso di riferimento.`,
        );
      }
      if (filtered.length > 0) {
        result.routes = filtered;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
