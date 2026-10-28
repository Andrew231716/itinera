/**
 * Extract plain text from a PDF in the browser (or Node).
 * Uses `unpdf` — avoids the broken pdf-parse ESM debug harness on Vercel.
 */
export async function extractPdfText(
  data: ArrayBuffer | Uint8Array,
): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(data);
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(result.text)
    ? result.text.join("\n")
    : String(result.text ?? "");
  return {
    text,
    pages: result.totalPages ?? 1,
  };
}
