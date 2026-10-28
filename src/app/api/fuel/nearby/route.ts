import { NextResponse } from "next/server";
import { searchNearbyFuel } from "@/lib/fuel/search";
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
    const alongLat = searchParams.get("alongLat");
    const alongLng = searchParams.get("alongLng");
    const adblue = searchParams.get("adblue") === "1";
    const lpg = searchParams.get("lpg") === "1";
    const open24h = searchParams.get("open24h") === "1";
    const truck = searchParams.get("truck") === "1";
    const brand = searchParams.get("brand")?.trim() || undefined;

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

    let alongTo: { lat: number; lng: number } | undefined;
    if (alongLat != null && alongLng != null) {
      const aLat = Number(alongLat);
      const aLng = Number(alongLng);
      if (Number.isFinite(aLat) && Number.isFinite(aLng)) {
        alongTo = { lat: aLat, lng: aLng };
      }
    }

    const result = await searchNearbyFuel({
      center: { lat, lng },
      radiusMeters: radius,
      query,
      label,
      alongTo,
      adblue,
      lpg,
      open24h,
      truck,
      brand,
    });

    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
