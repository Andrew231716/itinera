import { NextResponse } from "next/server";
import { searchNearbyParking } from "@/lib/parking/search";
import { apiErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const radius = searchParams.get("radius")
      ? Number(searchParams.get("radius"))
      : undefined;
    const query = searchParams.get("q")?.trim() || undefined;
    const label = searchParams.get("label")?.trim() || undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new AppError(
        "VALIDATION",
        "Coordinate lat/lng obbligatorie.",
        400,
      );
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new AppError("VALIDATION", "Coordinate fuori intervallo.", 400);
    }

    const result = await searchNearbyParking({
      center: { lat, lng },
      radiusMeters: radius,
      query,
      label,
    });

    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
