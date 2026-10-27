import {
  buildGoogleMapsDirectionsLink,
  openMapsDirectionsUrl,
  nativeShare,
  type MapsLinkResult,
} from "@/lib/google/maps-links";
import type { GiroStop, ScheduleStop } from "@/lib/routing/travel-schedule";
import {
  DEFAULT_ROAD_PREFERENCES,
  type PlaceRef,
  type RoadPreferences,
  type TravelMode,
} from "@/lib/types/trip";
import {
  formatClockIt,
  formatDuration,
} from "@/lib/utils/format";

export type GiroExportDoc = {
  title: string;
  origin: PlaceRef;
  departureAt: string | null;
  stops: GiroStop[];
  schedule: ScheduleStop[] | null;
};

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lockLabel(lock: GiroStop["positionLock"]): string {
  if (lock === "auto") return "Libera";
  if (lock === "last") return "Ultima";
  return `${lock}ª`;
}

/** Printable HTML for «Salva come PDF». */
export function buildGiroPdfHtml(doc: GiroExportDoc, mapsUrl?: string): string {
  const depart =
    doc.departureAt != null ? formatClockIt(doc.departureAt) : "—";
  const dateLabel = doc.departureAt
    ? new Date(doc.departureAt).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const scheduleRows =
    doc.schedule && doc.schedule.length > 0
      ? doc.schedule
          .map((row, idx) => {
            const role =
              row.kind === "origin"
                ? "Partenza"
                : row.kind === "destination"
                  ? "Arrivo"
                  : `Tappa ${idx}`;
            const appt = row.arriveBy
              ? `<div class="muted">Appuntamento ${escapeHtml(formatClockIt(row.arriveBy))}${
                  row.vsArriveBySeconds != null
                    ? row.vsArriveBySeconds > 60
                      ? ` · ritardo ${escapeHtml(formatDuration(row.vsArriveBySeconds))}`
                      : row.vsArriveBySeconds < -60
                        ? ` · anticipo ${escapeHtml(formatDuration(-row.vsArriveBySeconds))}`
                        : " · in orario"
                    : ""
                }</div>`
              : "";
            const travel =
              row.legFromPreviousSeconds > 0
                ? `<div class="muted">+${escapeHtml(formatDuration(row.legFromPreviousSeconds))} dal precedente</div>`
                : "";
            return `<tr>
              <td class="time">${escapeHtml(formatClockIt(row.arrivalAt))}</td>
              <td>
                <div class="role">${escapeHtml(role)}</div>
                <div class="place">${escapeHtml(row.place.label)}</div>
                ${row.place.address ? `<div class="muted">${escapeHtml(row.place.address)}</div>` : ""}
                ${travel}${appt}
              </td>
            </tr>`;
          })
          .join("")
      : doc.stops
          .map((s, i) => {
            const appt = s.arriveBy
              ? `<div class="muted">Appuntamento ${escapeHtml(formatClockIt(s.arriveBy))}</div>`
              : "";
            return `<tr>
              <td class="time">${i + 1}</td>
              <td>
                <div class="place">${escapeHtml(s.place.label)}</div>
                ${s.place.address ? `<div class="muted">${escapeHtml(s.place.address)}</div>` : ""}
                <div class="muted">Posizione: ${escapeHtml(lockLabel(s.positionLock))}</div>
                ${appt}
              </td>
            </tr>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.title)}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 0; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #555; font-size: 13px; margin-bottom: 18px; }
    .meta { font-size: 13px; margin-bottom: 20px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; }
    tr { page-break-inside: avoid; }
    td { vertical-align: top; padding: 10px 8px; border-bottom: 1px solid #ddd; }
    .time { width: 64px; font-weight: 700; font-size: 16px; }
    .role { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
    .place { font-size: 15px; font-weight: 600; margin-top: 2px; }
    .muted { font-size: 12px; color: #666; margin-top: 2px; }
    .maps { margin-top: 22px; font-size: 12px; word-break: break-all; }
    .foot { margin-top: 28px; font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <h1>${escapeHtml(doc.title)}</h1>
  <div class="sub">Giro Itinera${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ""}</div>
  <div class="meta">
    <div><strong>Partenza:</strong> ${escapeHtml(doc.origin.label)}</div>
    <div><strong>Ora partenza:</strong> ${escapeHtml(depart)}</div>
    <div><strong>Tappe:</strong> ${doc.stops.length}</div>
  </div>
  <table>
    <tbody>
      ${
        doc.schedule && doc.schedule.length > 0
          ? scheduleRows
          : `<tr><td class="time">—</td><td><div class="place">${escapeHtml(doc.origin.label)}</div><div class="role">Partenza</div></td></tr>${scheduleRows}`
      }
    </tbody>
  </table>
  ${
    mapsUrl
      ? `<div class="maps"><strong>Google Maps:</strong><br/>${escapeHtml(mapsUrl)}</div>`
      : ""
  }
  <div class="foot">Generato con Itinera · gli orari sono stime di percorso</div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  </script>
</body>
</html>`;
}

/**
 * Opens a print window so the user can save as PDF.
 * Returns false if the popup was blocked.
 */
export function exportGiroPdf(
  doc: GiroExportDoc,
  mapsUrl?: string,
): boolean {
  if (typeof window === "undefined") return false;
  const html = buildGiroPdfHtml(doc, mapsUrl);
  const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
