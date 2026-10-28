import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/giro/extract-pdf-text";
import { parsePianoFermateText } from "@/lib/giro/parse-piano-fermate";
import { apiErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      throw new AppError("VALIDATION", "Carica un file PDF.", 400);
    }
    const blob = file as Blob;
    if (blob.size > 8_000_000) {
      throw new AppError("VALIDATION", "PDF troppo grande (max 8 MB).", 400);
    }

    const buf = await blob.arrayBuffer();
    let text = "";
    let pages = 1;
    try {
      const extracted = await extractPdfText(buf);
      text = extracted.text;
      pages = extracted.pages;
    } catch (err) {
      console.error("[giro/import-pdf] extract failed", err);
      throw new AppError(
        "PDF_EXTRACT",
        "Non riesco a leggere questo PDF. Riprova con il file originale «Piano fermate driver».",
        422,
        err,
      );
    }

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
      pages,
    });
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
