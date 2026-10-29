import { jsPDF } from "jspdf";
import {
  buildGoogleMapsDirectionsLink,
  openMapsDirectionsUrl,
  nativeShare,
  type MapsLinkResult,
} from "@/lib/google/maps-links";
import type { GiroStop, ScheduleStop } from "@/lib/routing/travel-schedule";
import { drawGiroMapCanvas, placesToMapPoints } from "@/lib/giro/giro-map-draw";
import { summarizeTravelRules } from "@/lib/routing/travel-rules";
import {
  DEFAULT_ROAD_PREFERENCES,
  type PlaceRef,
  type RoadPreferences,
  type TravelMode,
} from "@/lib/types/trip";
import { formatClockIt, formatDuration } from "@/lib/utils/format";

export type GiroExportDoc = {
  title: string;
  origin: PlaceRef;
  departureAt: string | null;
  stops: GiroStop[];
  schedule: ScheduleStop[] | null;
  preferences?: RoadPreferences;
  travelMode?: TravelMode;
  mapsUrl?: string;
};

export type GiroPdfKind = "list" | "map";

export type GiroPdfExportResult =
  | { ok: true; fileName: string; opened: boolean; downloaded: boolean }
  | { ok: false; error: string };

export function buildGiroMapsLink(params: {
  origin: PlaceRef;
  stops: PlaceRef[];
  travelMode?: TravelMode;
  preferences?: RoadPreferences;
}): MapsLinkResult | null {
  if (params.stops.length < 1) return null;
  const destination = params.stops[params.stops.length - 1];
  const intermediates = params.stops.slice(0, -1);
  return buildGoogleMapsDirectionsLink({
    origin: params.origin,
    destination,
    stops: intermediates,
    travelMode: params.travelMode ?? "DRIVE",
    preferences: params.preferences ?? DEFAULT_ROAD_PREFERENCES,
  });
}

export function openGiroInMaps(link: MapsLinkResult): void {
  openMapsDirectionsUrl(link.url);
}

export async function shareGiroMapsLink(params: {
  title: string;
  link: MapsLinkResult;
}): Promise<"shared" | "copied" | "unsupported"> {
  return nativeShare({
    title: params.title,
    text: `Giro Itinera: ${params.link.preview.origin} → ${params.link.preview.destination}`,
    url: params.link.url,
  });
}

/** jsPDF Helvetica is WinAnsi — strip characters that can crash .text(). */
export function pdfSafeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lockLabel(lock: GiroStop["positionLock"]): string {
  if (lock === "auto") return "Libera";
  if (lock === "last") return "Ultima";
  return `${lock}a`;
}

function safeFileName(title: string): string {
  const base = title
    .trim()
    .replace(/[^\w\u00C0-\u024F\s-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return base || "giro-itinera";
}

function prefsLine(doc: GiroExportDoc): string {
  const prefs = doc.preferences ?? DEFAULT_ROAD_PREFERENCES;
  return summarizeTravelRules(prefs, []);
}

function dateLine(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function write(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: { maxWidth?: number },
): number {
  const safe = pdfSafeText(text);
  if (!safe) return 0;
  if (options?.maxWidth) {
    const lines = pdf.splitTextToSize(safe, options.maxWidth) as string[];
    pdf.text(lines, x, y);
    return lines.length;
  }
  pdf.text(safe, x, y);
  return 1;
}

function addHeader(pdf: jsPDF, doc: GiroExportDoc, subtitle: string): number {
  let y = 16;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  y += write(pdf, doc.title, 14, y, { maxWidth: 180 }) * 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80);
  y += write(pdf, `Giro Itinera - ${subtitle}`, 14, y) * 5;
  const date = dateLine(doc.departureAt);
  if (date) {
    y += write(pdf, date, 14, y, { maxWidth: 180 }) * 5;
  }
  y += write(pdf, `Partenza: ${doc.origin.label}`, 14, y, { maxWidth: 180 }) * 5;
  y +=
    write(
      pdf,
      `Ora partenza: ${doc.departureAt ? formatClockIt(doc.departureAt) : "-"}`,
      14,
      y,
    ) * 5;
  y +=
    write(
      pdf,
      `Tappe: ${doc.stops.length} - Regole: ${prefsLine(doc)}`,
      14,
      y,
      { maxWidth: 180 },
    ) * 5;
  if (doc.travelMode) {
    y += write(pdf, `Mezzo: ${doc.travelMode}`, 14, y) * 5;
  }
  pdf.setTextColor(0);
  return y + 3;
}

function buildListRows(doc: GiroExportDoc): Array<{
  left: string;
  title: string;
  detail: string;
}> {
  if (doc.schedule && doc.schedule.length > 0) {
    return doc.schedule.map((row, idx) => {
      const role =
        row.kind === "origin"
          ? "Partenza"
          : row.kind === "destination"
            ? "Arrivo"
            : `Tappa ${idx}`;
      const bits = [row.place.address].filter(Boolean) as string[];
      if (row.legFromPreviousSeconds > 0) {
        bits.push(`+${formatDuration(row.legFromPreviousSeconds)} dal precedente`);
      }
      if (row.arriveBy) {
        bits.push(`Appuntamento ${formatClockIt(row.arriveBy)}`);
      }
      return {
        left: formatClockIt(row.arrivalAt),
        title: `${role} - ${row.place.label}`,
        detail: bits.join(" - "),
      };
    });
  }

  const rows = [
    {
      left: "P",
      title: `Partenza - ${doc.origin.label}`,
      detail: doc.origin.address ?? "",
    },
  ];
  for (let i = 0; i < doc.stops.length; i++) {
    const s = doc.stops[i];
    const bits = [
      s.place.address,
      `Posizione: ${lockLabel(s.positionLock)}`,
      s.arriveBy ? `Appuntamento ${formatClockIt(s.arriveBy)}` : null,
    ].filter(Boolean) as string[];
    rows.push({
      left: String(i + 1),
      title: s.place.label,
      detail: bits.join(" - "),
    });
  }
  return rows;
}

export function buildGiroListPdf(doc: GiroExportDoc): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  let y = addHeader(pdf, doc, "PDF elenco");
  const rows = buildListRows(doc);
  const pageH = pdf.internal.pageSize.getHeight();

  for (const row of rows) {
    if (y > pageH - 24) {
      pdf.addPage();
      y = 16;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    write(pdf, row.left, 14, y);
    pdf.setFontSize(11);
    const titleLines = Math.max(
      1,
      write(pdf, row.title, 36, y, { maxWidth: 160 }),
    );
    y += titleLines * 5;
    if (row.detail) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(90);
      const detailLines = Math.max(
        1,
        write(pdf, row.detail, 36, y, { maxWidth: 160 }),
      );
      y += detailLines * 4 + 3;
      pdf.setTextColor(0);
    } else {
      y += 4;
    }
  }

  if (doc.mapsUrl) {
    if (y > pageH - 30) {
      pdf.addPage();
      y = 16;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    y += write(pdf, "Google Maps", 14, y) * 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(60);
    write(pdf, doc.mapsUrl, 14, y, { maxWidth: 180 });
    pdf.setTextColor(0);
  }

  return pdf;
}

export type MapLegendRow = {
  n: number;
  time: string;
  label: string;
  detail: string;
};

/** Legend rows for the map PDF: number, clock, name (+ appointment). */
export function buildMapLegendRows(doc: GiroExportDoc): MapLegendRow[] {
  const mapPoints = placesToMapPoints(
    doc.origin,
    doc.stops.map((s) => s.place),
  );
  return mapPoints.map((p) => {
    const scheduleRow =
      doc.schedule && doc.schedule[p.index] ? doc.schedule[p.index] : null;
    const stop = p.index === 0 ? null : doc.stops[p.index - 1];
    const etaIso =
      scheduleRow?.arrivalAt ??
      (p.index === 0 ? doc.departureAt : null);
    const apptIso = scheduleRow?.arriveBy ?? stop?.arriveBy ?? null;
    const detailParts: string[] = [];
    if (p.index === 0) detailParts.push("Partenza");
    else if (p.index === mapPoints.length - 1) detailParts.push("Arrivo");
    if (apptIso) detailParts.push(`Appuntamento ${formatClockIt(apptIso)}`);
    if (scheduleRow && scheduleRow.legFromPreviousSeconds > 0) {
      detailParts.push(
        `+${formatDuration(scheduleRow.legFromPreviousSeconds)} di viaggio`,
      );
    }
    return {
      n: p.index + 1,
      time: etaIso ? formatClockIt(etaIso) : "--:--",
      label: p.label,
      detail: detailParts.join(" · "),
    };
  });
}

export function buildGiroMapPdf(doc: GiroExportDoc): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = addHeader(pdf, doc, "PDF mappa tappe");

  const mapPoints = placesToMapPoints(
    doc.origin,
    doc.stops.map((s) => s.place),
  );
  const canvas = drawGiroMapCanvas(mapPoints, 1100, 780);
  if (canvas) {
    const img = canvas.toDataURL("image/png");
    const pageW = pdf.internal.pageSize.getWidth();
    const imgW = pageW - 28;
    const imgH = (imgW * canvas.height) / canvas.width;
    pdf.addImage(img, "PNG", 14, y, imgW, Math.min(imgH, 110));
    y += Math.min(imgH, 110) + 6;
  } else {
    pdf.setFontSize(10);
    y += write(pdf, "Mappa non disponibile su questo dispositivo.", 14, y) * 6;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  y += write(pdf, "Legenda tappe (ordine e orari)", 14, y) * 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  y +=
    write(
      pdf,
      "N.  Orario ETA   Tappa (appuntamento se impostato)",
      14,
      y,
    ) * 4;
  pdf.setTextColor(0);

  const legend = buildMapLegendRows(doc);
  const pageH = pdf.internal.pageSize.getHeight();
  for (const row of legend) {
    if (y > pageH - 18) {
      pdf.addPage();
      y = 16;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    write(pdf, String(row.n), 14, y);
    write(pdf, row.time, 22, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const labelLines = Math.max(
      1,
      write(pdf, row.label, 42, y, { maxWidth: 150 }),
    );
    y += labelLines * 4.2;
    if (row.detail) {
      pdf.setFontSize(8);
      pdf.setTextColor(90);
      const detailLines = Math.max(
        1,
        write(pdf, row.detail, 42, y, { maxWidth: 150 }),
      );
      y += detailLines * 3.6 + 1.5;
      pdf.setTextColor(0);
    } else {
      y += 2.5;
    }
  }

  return pdf;
}

/** @deprecated use buildGiroListPdf — kept for tests */
export function buildGiroListPdfBlob(doc: GiroExportDoc): Blob {
  return buildGiroListPdf(doc).output("blob");
}

/** @deprecated use buildGiroMapPdf — kept for tests */
export function buildGiroMapPdfBlob(doc: GiroExportDoc): Blob {
  return buildGiroMapPdf(doc).output("blob");
}

/**
 * Open the PDF in a new tab (so the user sees it) and also download the file.
 * Mobile browsers often hide silent downloads — opening is the reliable path.
 */
export function deliverPdf(
  pdf: jsPDF,
  fileName: string,
): { opened: boolean; downloaded: boolean } {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  let opened = false;
  let downloaded = false;

  // 1) Open in a new tab / viewer (what users expect when they tap PDF)
  try {
    const openLink = document.createElement("a");
    openLink.href = url;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.type = "application/pdf";
    document.body.appendChild(openLink);
    openLink.click();
    openLink.remove();
    opened = true;
  } catch {
    try {
      const win = window.open(url, "_blank");
      if (win) {
        opened = true;
        try {
          win.opener = null;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* popup blocked */
    }
  }

  // 2) Also save via jsPDF (more reliable than a synthetic <a download>)
  try {
    pdf.save(fileName);
    downloaded = true;
  } catch {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
      downloaded = true;
    } catch {
      /* ignore */
    }
  }

  // 3) Last resort: navigate same tab to the blob
  if (!opened && !downloaded) {
    try {
      window.location.assign(url);
      opened = true;
    } catch {
      /* ignore */
    }
  }

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, opened ? 120_000 : 4_000);

  return { opened, downloaded };
}

/**
 * Generate a real PDF and open/download it.
 */
export function exportGiroPdf(
  doc: GiroExportDoc,
  kind: GiroPdfKind = "list",
): GiroPdfExportResult {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, error: "PDF disponibile solo nel browser." };
  }
  try {
    const pdf = kind === "map" ? buildGiroMapPdf(doc) : buildGiroListPdf(doc);
    const suffix = kind === "map" ? "mappa" : "elenco";
    const fileName = `${safeFileName(doc.title)}-${suffix}.pdf`;
    const { opened, downloaded } = deliverPdf(pdf, fileName);
    if (!opened && !downloaded) {
      return {
        ok: false,
        error:
          "Impossibile aprire o scaricare il PDF. Controlla il blocco popup del browser.",
      };
    }
    return { ok: true, fileName, opened, downloaded };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Generazione PDF fallita.",
    };
  }
}

/** Kept for tests of printable HTML content */
export function buildGiroPdfHtml(
  doc: GiroExportDoc,
  mapsUrl?: string,
): string {
  const prefs = prefsLine(doc);
  const rows = buildListRows(doc)
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.left)}</td><td><strong>${escapeHtml(r.title)}</strong><div>${escapeHtml(r.detail)}</div></td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><title>${escapeHtml(doc.title)}</title></head><body>
  <h1>${escapeHtml(doc.title)}</h1>
  <p>${escapeHtml(prefs)}</p>
  <table>${rows}</table>
  ${mapsUrl ? `<p>${escapeHtml(mapsUrl)}</p>` : ""}
  </body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
