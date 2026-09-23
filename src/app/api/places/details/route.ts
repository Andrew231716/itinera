import { NextResponse } from "next/server";
import { getServerGoogleMapsKey } from "@/lib/config/env";
import { fetchPlaceDetails } from "@/lib/google/places-client";
import { apiErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("placeId")?.trim() ?? "";
    if (!placeId || placeId.length > 256) {
      return NextResponse.json(
        { error: "placeId non valido.", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const result = await fetchPlaceDetails(placeId, getServerGoogleMapsKey());
    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
