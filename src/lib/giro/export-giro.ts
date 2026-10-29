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

function lockLabel(lock: GiroStop["positionLock"]): string {
  if (lock === "auto") return "Libera";
  if (lock === "last") return "Ultima";
  return `${lock}ª`;
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

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function addHeader(pdf: jsPDF, doc: GiroExportDoc, subtitle: string): number {
  let y = 16;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(doc.title, 14, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80);
  pdf.text(`Giro Itinera · ${subtitle}`, 14, y);
  y += 6;
  const date = dateLine(doc.departureAt);
  if (date) {
    pdf.text(date, 14, y);
    y += 5;
  }
  pdf.text(`Partenza: ${doc.origin.label}`, 14, y);
  y += 5;
  pdf.text(
    `Ora partenza: ${doc.departureAt ? formatClockIt(doc.departureAt) : "—"}`,
    14,
    y,
  );
  y += 5;
  pdf.text(`Tappe: ${doc.stops.length} · Regole: ${prefsLine(doc)}`, 14, y);
  y += 5;
  if (doc.travelMode) {
    pdf.text(`Mezzo: ${doc.travelMode}`, 14, y);
    y += 5;
  }
  pdf.setTextColor(0);
  y += 3;
  return y;
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
        title: `${role} · ${row.place.label}`,
        detail: bits.join(" · "),
      };
    });
  }

  const rows = [
    {
      left: "P",
      title: `Partenza · ${doc.origin.label}`,
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
      detail: bits.join(" · "),
    });
  }
  return rows;
}

/** Build a real PDF (elenco orari / tappe). */
export function buildGiroListPdfBlob(doc: GiroExportDoc): Blob {
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
    pdf.text(row.left, 14, y);
    pdf.setFontSize(11);
    const titleLines = pdf.splitTextToSize(row.title, 160);
    pdf.text(titleLines, 36, y);
    y += titleLines.length * 5;
    if (row.detail) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(90);
      const detailLines = pdf.splitTextToSize(row.detail, 160);
      pdf.text(detailLines, 36, y);
      y += detailLines.length * 4 + 3;
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
    pdf.text("Google Maps", 14, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(60);
    const urlLines = pdf.splitTextToSize(doc.mapsUrl, 180);
    pdf.text(urlLines, 14, y);
    pdf.setTextColor(0);
  }

  return pdf.output("blob");
}

/** Build a PDF with schematic map + ordered labeled stops. */
export function buildGiroMapPdfBlob(doc: GiroExportDoc): Blob {
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
    pdf.addImage(img, "PNG", 14, y, imgW, imgH);
    y += imgH + 8;
  } else {
    pdf.setFontSize(10);
    pdf.text("Mappa non disponibile su questo dispositivo.", 14, y);
    y += 8;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Legenda tappe (in ordine)", 14, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  const pageH = pdf.internal.pageSize.getHeight();
  for (const p of mapPoints) {
    if (y > pageH - 16) {
      pdf.addPage();
      y = 16;
    }
    const time =
      doc.schedule?.find(
        (s) =>
          s.place.id === (p.index === 0 ? doc.origin.id : doc.stops[p.index - 1]?.place.id),
      )?.arrivalAt ?? null;
    const line = `${p.index + 1}. ${p.label}${
      time ? ` · ${formatClockIt(time)}` : ""
    }`;
    const lines = pdf.splitTextToSize(line, 180);
    pdf.text(lines, 14, y);
    y += lines.length * 4.5 + 1;
  }

  return pdf.output("blob");
}

/**
 * Generate and download a real PDF (elenco or mappa).
 */
export function exportGiroPdf(
  doc: GiroExportDoc,
  kind: GiroPdfKind = "list",
): { ok: true; fileName: string } | { ok: false; error: string } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, error: "PDF disponibile solo nel browser." };
  }
  try {
    const blob =
      kind === "map" ? buildGiroMapPdfBlob(doc) : buildGiroListPdfBlob(doc);
    const suffix = kind === "map" ? "mappa" : "elenco";
    const fileName = `${safeFileName(doc.title)}-${suffix}.pdf`;
    downloadBlob(blob, fileName);
    return { ok: true, fileName };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Generazione PDF fallita.",
    };
  }
}

/** @deprecated kept for tests of printable HTML content */
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
