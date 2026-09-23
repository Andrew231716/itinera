import { NextResponse } from "next/server";
import { parseNaturalLanguageRequest } from "@/lib/ai/assistant";
import { getOpenAiKey } from "@/lib/config/env";
import { apiErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { utterance?: unknown };
    const utterance =
      typeof body.utterance === "string" ? body.utterance.slice(0, 2000) : "";

    const result = await parseNaturalLanguageRequest(
      { utterance, locale: "it" },
      getOpenAiKey(),
    );

    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
