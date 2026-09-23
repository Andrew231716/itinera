import { NextResponse } from "next/server";
import { getServerGoogleMapsKey } from "@/lib/config/env";
import { autocompletePlaces } from "@/lib/google/places-client";
import { apiErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (q.length > 200) {
      return NextResponse.json(
        { error: "Query troppo lunga.", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const result = await autocompletePlaces(q, getServerGoogleMapsKey());
    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
