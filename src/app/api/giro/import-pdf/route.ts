import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import { parsePianoFermateText } from "@/lib/giro/parse-piano-fermate";
import { apiErrorResponse, AppError } from "@/lib/utils/errors";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);

type PdfParseFn = (
  data: Buffer,
) => Promise<{ text: string; numpages: number }>;

function loadPdfParse(): PdfParseFn {
  // Import the library entry, NOT package root — pdf-parse/index.js runs a
  // debug harness when module.parent is missing (breaks ESM / Next).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("pdf-parse/lib/pdf-parse.js") as PdfParseFn;
}

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
    const fileName =
      "name" in file && typeof (file as File).name === "string"
        ? (file as File).name.toLowerCase()
        : "";
    const type = blob.type || "";
    if (
      fileName &&
      !fileName.endsWith(".pdf") &&
      type !== "application/pdf" &&
      type !== "application/octet-stream" &&
      type !== ""
    ) {
      throw new AppError("VALIDATION", "Il file deve essere un PDF.", 400);
    }

    const buf = Buffer.from(await blob.arrayBuffer());
    let extracted: { text: string; numpages: number };
    try {
      const pdfParse = loadPdfParse();
      extracted = await pdfParse(buf);
    } catch (err) {
      console.error("[giro/import-pdf] pdf extract failed", err);
      throw new AppError(
        "PDF_EXTRACT",
        "Non riesco a leggere questo PDF. Riprova con il file originale «Piano fermate driver».",
        422,
        err,
      );
    }

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
