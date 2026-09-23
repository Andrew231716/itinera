import { NextResponse } from "next/server";
import { getPublicConfigPayload } from "@/lib/config/readiness";
import { apiErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getPublicConfigPayload());
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
