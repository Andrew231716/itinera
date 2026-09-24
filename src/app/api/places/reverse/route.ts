import { NextResponse } from "next/server";
import { getServerGoogleMapsKey } from "@/lib/config/env";
import { reverseGeocode } from "@/lib/google/places-client";
import { apiErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new AppError(
        "VALIDATION",
        "Parametri lat e lng obbligatori.",
        400,
      );
    }

    const result = await reverseGeocode(lat, lng, getServerGoogleMapsKey());
    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
