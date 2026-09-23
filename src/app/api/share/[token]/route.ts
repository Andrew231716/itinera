import { NextResponse } from "next/server";
import { fetchSharedTripServer } from "@/lib/storage/trip-repository";
import { isSupabaseConfigured } from "@/lib/storage/supabase-client";
import { apiErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16 || token.length > 128) {
      return NextResponse.json(
        { error: "Token non valido.", code: "VALIDATION" },
        { status: 400 },
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        mode: "local_only",
        trip: null,
        message:
          "Supabase non configurato: i link cloud non sono disponibili. Usa la condivisione locale sul dispositivo che ha salvato il viaggio.",
      });
    }

    const trip = await fetchSharedTripServer(token);
    if (!trip) {
      return NextResponse.json(
        {
          error: "Link inesistente, scaduto o revocato.",
          code: "NOT_FOUND",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      mode: "live",
      trip,
      permission: "read",
    });
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
