import type { GiroStop } from "@/lib/routing/travel-schedule";

export type ParsedFermata = {
  index: number;
  time: string; // HH:MM
  name: string;
  address: string | null;
  tipo: string | null;
};

export type ParsedPianoFermate = {
  kind: "piano_fermate";
  title: string;
  date: string; // YYYY-MM-DD
  dateLabel: string; // DD/MM/YYYY
  giroName: string | null;
  total: number | null;
  stops: ParsedFermata[];
  /** Suggested departure ISO (15 min before first stop, Europe/Rome) */
  departureAt: string | null;
};

const HEADER_RE = /Piano\s+fermate\s+driver/i;
const DATE_RE = /Data:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const GIRI_RE = /Giri:\s*(.+)/i;
const TOTAL_RE = /Totale\s+elementi:\s*(\d+)/i;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build ISO from Europe/Rome calendar date + HH:MM. */
export function romeLocalToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "shortOffset",
  }).formatToParts(probe);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let offsetMin = 60;
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    offsetMin = sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  }
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMin * 60_000;
  return new Date(utcMs).toISOString();
}

/**
 * Split glued "110:30" / "1012:30" into stop index + HH:MM.
 * Prefer a valid hour (0–23); remaining leading digits are the index.
 */
export function splitIndexAndTime(
  digitsBeforeColon: string,
  minutes: string,
): { index: number; time: string } | null {
  if (!/^\d+$/.test(digitsBeforeColon) || !/^\d{2}$/.test(minutes)) {
    return null;
  }
  for (const hourLen of [2, 1] as const) {
    if (digitsBeforeColon.length <= hourLen) continue;
    const hourStr = digitsBeforeColon.slice(-hourLen);
    const indexStr = digitsBeforeColon.slice(0, -hourLen);
    if (indexStr.length < 1 || indexStr.length > 2) continue;
    const hour = Number(hourStr);
    const index = Number(indexStr);
    if (index >= 1 && hour >= 0 && hour <= 23) {
      return { index, time: `${pad2(hour)}:${minutes}` };
    }
  }
  return null;
}

function cleanStopChunk(raw: string): {
  name: string;
  address: string | null;
  tipo: string | null;
} {
  let text = raw.replace(/\r/g, "").trim();

  let address: string | null = null;
  const addrMatch = text.match(
    /([^\n]*·\s*Via[\s\S]*?)(?=\nDocumento|\s*$)/i,
  );
  if (addrMatch) {
    address = addrMatch[1]
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/,\s*$/, "")
      .trim();
    text = text.slice(0, addrMatch.index).trim();
  }

  let tipo: string | null = null;
  if (/Scarico\s*\n?\s*finale/i.test(text) || /Scarico\s+finale/i.test(text)) {
    tipo = "Scarico finale";
  } else if (/Staffetta/i.test(text)) {
    tipo = "Staffetta";
  } else if (/Fermata/i.test(text)) {
    tipo = "Fermata";
  }

  text = text
    .replace(/Fermata(?=AA|\s|$)/gi, "\n")
    .replace(/Scarico\s*\n?\s*finale/gi, "\n")
    .replace(/Staffetta/gi, "\n")
    .replace(/AA\s*Milano[^\n]*/gi, "\n")
    .replace(/\(Jolly\s*\d+\)/gi, "\n")
    .replace(/Documento generato da LogiTrack Pro/gi, "\n");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const name = lines.join(" ").replace(/\s+/g, " ").trim();

  return { name, address, tipo };
}

type Anchor = {
  index: number;
  time: string;
  matchStart: number;
  contentAt: number;
};

function findAnchors(raw: string): Anchor[] {
  const anchors: Anchor[] = [];

  // Spaced form: "1 10:30 Name"
  const spaced = /(?:^|\n)\s*(\d{1,2})\s+(\d{1,2}):(\d{2})(?!\d)/g;
  let sm: RegExpExecArray | null;
  while ((sm = spaced.exec(raw)) !== null) {
    const hour = Number(sm[2]);
    if (hour > 23) continue;
    anchors.push({
      index: Number(sm[1]),
      time: `${pad2(hour)}:${sm[3]}`,
      matchStart: sm.index,
      contentAt: sm.index + sm[0].length,
    });
  }

  if (anchors.length > 0) return anchors;

  // Collapsed pdf-parse form: "110:30Cerba" / "1012:30Cerba"
  const glued = /(?:^|\n)\s*(\d{2,}):(\d{2})(?!\d)/g;
  let gm: RegExpExecArray | null;
  while ((gm = glued.exec(raw)) !== null) {
    const split = splitIndexAndTime(gm[1], gm[2]);
    if (!split) continue;
    anchors.push({
      index: split.index,
      time: split.time,
      matchStart: gm.index,
      contentAt: gm.index + gm[0].length,
    });
  }

  return anchors;
}

/**
 * Parse text extracted from a LogiTrack / «Piano fermate driver» PDF.
 */
export function parsePianoFermateText(raw: string): ParsedPianoFermate | null {
  if (!raw || !HEADER_RE.test(raw)) return null;

  const dateMatch = raw.match(DATE_RE);
  if (!dateMatch) return null;
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const dateLabel = `${pad2(day)}/${pad2(month)}/${year}`;
  const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;

  const giroMatch = raw.match(GIRI_RE);
  const giroName = giroMatch?.[1]?.split("\n")[0]?.trim() ?? null;
  const totalMatch = raw.match(TOTAL_RE);
  const total = totalMatch ? Number(totalMatch[1]) : null;

  const anchors = findAnchors(raw);
  const stops: ParsedFermata[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const end =
      i + 1 < anchors.length ? anchors[i + 1].matchStart : raw.length;
    const chunk = raw.slice(a.contentAt, end);
    const cleaned = cleanStopChunk(chunk);
    if (!cleaned.name) continue;
    if (/^(Ora|Fermata|#|destinazione)/i.test(cleaned.name)) continue;
    stops.push({
      index: a.index,
      time: a.time,
      name: cleaned.name,
      address: cleaned.address,
      tipo: cleaned.tipo,
    });
  }

  if (stops.length === 0) return null;

  const byIndex = new Map<number, ParsedFermata>();
  for (const s of stops) {
    if (!byIndex.has(s.index)) byIndex.set(s.index, s);
  }
  const ordered = [...byIndex.values()].sort((a, b) => a.index - b.index);

  const first = ordered[0];
  const [hh, mm] = first.time.split(":").map(Number);
  let depH = hh;
  let depM = mm - 15;
  if (depM < 0) {
    depM += 60;
    depH -= 1;
  }
  if (depH < 0) depH = 0;
  const departureAt = romeLocalToIso(year, month, day, depH, depM);

  return {
    kind: "piano_fermate",
    title: giroName
      ? `${giroName} · ${dateLabel}`
      : `Piano fermate · ${dateLabel}`,
    date: isoDate,
    dateLabel,
    giroName,
    total,
    stops: ordered,
    departureAt,
  };
}

/** Convert parsed fermate into editable GiroStop list (order locked). */
export function pianoFermateToGiroStops(
  parsed: ParsedPianoFermate,
  idFactory: () => string = () => crypto.randomUUID(),
): GiroStop[] {
  const n = parsed.stops.length;
  const [y, mo, d] = parsed.date.split("-").map(Number);
  return parsed.stops.map((s, i) => {
    const [hh, mm] = s.time.split(":").map(Number);
    const arriveBy = romeLocalToIso(y, mo, d, hh, mm);
    const isLast = i === n - 1;
    return {
      id: idFactory(),
      place: {
        id: idFactory(),
        label: s.name,
        address: s.address ?? undefined,
        location: { lat: 0, lng: 0 },
        source: "manual",
      },
      arriveBy,
      dwellMinutes: 0,
      positionLock: isLast ? "last" : i + 1,
    };
  });
}

export function isPianoFermateText(raw: string): boolean {
  return HEADER_RE.test(raw) && DATE_RE.test(raw);
}
