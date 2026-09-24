import { NextResponse } from "next/server";
import { parseNaturalLanguageRequest } from "@/lib/ai/assistant";
import { apiErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      utterance?: unknown;
      tripContext?: {
        originLabel?: unknown;
        destinationLabel?: unknown;
        stopLabels?: unknown;
        exclusionLabels?: unknown;
      };
    };
    const utterance =
      typeof body.utterance === "string" ? body.utterance.slice(0, 2000) : "";

    const ctx = body.tripContext;
    const tripContext =
      ctx && typeof ctx === "object"
        ? {
            originLabel:
              typeof ctx.originLabel === "string" ? ctx.originLabel : null,
            destinationLabel:
              typeof ctx.destinationLabel === "string"
                ? ctx.destinationLabel
                : null,
            stopLabels: Array.isArray(ctx.stopLabels)
              ? ctx.stopLabels
                  .filter((s): s is string => typeof s === "string")
                  .slice(0, 30)
              : [],
            exclusionLabels: Array.isArray(ctx.exclusionLabels)
              ? ctx.exclusionLabels
                  .filter((s): s is string => typeof s === "string")
                  .slice(0, 30)
              : [],
          }
        : undefined;

    const result = await parseNaturalLanguageRequest({
      utterance,
      locale: "it",
      tripContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
