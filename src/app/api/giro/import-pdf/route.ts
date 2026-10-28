import { NextResponse } from "next/server";
import { parsePianoFermateText } from "@/lib/giro/parse-piano-fermate";
import { apiErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION", "Carica un file PDF.", 400);
    }
    if (file.size > 8_000_000) {
      throw new AppError("VALIDATION", "PDF troppo grande (max 8 MB).", 400);
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
      throw new AppError("VALIDATION", "Il file deve essere un PDF.", 400);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    // pdf-parse is CJS; dynamic import keeps Next happy.
    const pdfParse = (await import("pdf-parse")).default as (
      data: Buffer,
    ) => Promise<{ text: string; numpages: number }>;
    const extracted = await pdfParse(buf);
    const text = extracted.text ?? "";

    const parsed = parsePianoFermateText(text);
    if (!parsed) {
      throw new AppError(
        "VALIDATION",
        "Non riconosco questo PDF. Attesi documenti «Piano fermate driver» (LogiTrack) con data, orari e fermate.",
        422,
      );
    }

    return NextResponse.json({
      ok: true,
      parsed,
      pages: extracted.numpages,
    });
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
