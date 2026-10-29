"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Clock3,
  ExternalLink,
  FileDown,
  FileUp,
  FolderOpen,
  History,
  ListOrdered,
  MapPin,
  RotateCcw,
  Save,
  Share2,
  Trash2,
} from "lucide-react";
import { nanoid } from "nanoid";
import { PlaceSearch } from "@/components/trip/PlaceSearch";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import {
  parseAddressLines,
  resolvePlaceQuery,
} from "@/lib/places/resolve-query";
import {
  buildArrivalSchedule,
  giroHasHardLocks,
  orderGiroStops,
  type GiroPositionLock,
  type GiroStop,
  type ScheduleStop,
} from "@/lib/routing/travel-schedule";
import {
  buildGiroMapsLink,
  exportGiroPdf,
  openGiroInMaps,
  shareGiroMapsLink,
  type GiroExportDoc,
} from "@/lib/giro/export-giro";
import { extractPdfText } from "@/lib/giro/extract-pdf-text";
import {
  parsePianoFermateText,
  pianoFermateToGiroStops,
  type ParsedPianoFermate,
} from "@/lib/giro/parse-piano-fermate";
import {
  listSavedGiri,
  removeSavedGiro,
  saveGiro,
  suggestGiroTitle,
  type SavedGiro,
} from "@/lib/storage/saved-giri";
import {
  formatClockIt,
  formatDateTimeLocal,
  formatDuration,
  formatRelativeIt,
  localInputToIso,
} from "@/lib/utils/format";
import type { PlaceRef } from "@/lib/types/trip";
import {
  Button,
  EmptyHint,
  Input,
  Label,
  SectionTitle,
  cn,
} from "@/components/ui/primitives";

function makeGiroStop(place: PlaceRef): GiroStop {
  return {
    id: nanoid(),
    place,
    arriveBy: null,
    positionLock: "auto",
  };
}

function placeKey(p: PlaceRef): string {
  return p.placeId ?? `${p.location.lat.toFixed(5)},${p.location.lng.toFixed(5)}`;
}

function defaultDepartureLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return formatDateTimeLocal(d.toISOString());
}

/**
 * Paste / search addresses → order by proximity (with locks) → ETA per stop.
 */
export function GiroPanel() {
  const applyGiro = useTripStore((s) => s.applyGiro);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const tripOrigin = useTripStore((s) => s.trip.origin);
  const travelMode = useTripStore((s) => s.trip.travelMode);
  const preferences = useTripStore((s) => s.trip.preferences);
  const giroSeed = useTripStore((s) => s.giroSeed);
  const consumeGiroSeed = useTripStore((s) => s.consumeGiroSeed);
  const openTripInGiro = useTripStore((s) => s.openTripInGiro);
  const tripHistory = useTripStore((s) => s.tripHistory);
  const refreshTripHistory = useTripStore((s) => s.refreshTripHistory);
  const { computeRoute } = useRouteCompute();

  const [start, setStart] = useState<PlaceRef | null>(tripOrigin);
  const [departureLocal, setDepartureLocal] = useState(defaultDepartureLocal);
  const [listText, setListText] = useState("");
  const [stops, setStops] = useState<GiroStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<string[]>([]);
  const [orderWarnings, setOrderWarnings] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ScheduleStop[] | null>(null);
  const [addKey, setAddKey] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [savedList, setSavedList] = useState<SavedGiro[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  /** Origin used for the last computed giro (for export). */
  const [exportOrigin, setExportOrigin] = useState<PlaceRef | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lineCount = useMemo(
    () => parseAddressLines(listText).length,
    [listText],
  );

  function refreshSaved() {
    setSavedList(listSavedGiri());
  }

  useEffect(() => {
    refreshSaved();
    refreshTripHistory();
  }, [refreshTripHistory]);

  useEffect(() => {
    if (!giroSeed) return;
    const seed = consumeGiroSeed();
    if (!seed) return;
    setError(null);
    setLineErrors([]);
    setOrderWarnings([]);
    setSchedule(null);
    setListText("");
    setSavedId(null);
    setSaveTitle(seed.title);
    setStart(seed.origin);
    setExportOrigin(seed.origin);
    setStops(structuredClone(seed.stops));
    if (seed.departureAt) {
      setDepartureLocal(formatDateTimeLocal(seed.departureAt));
    }
    setSaveMessage(`Aperto da cronologia: ${seed.title}`);
  }, [giroSeed, consumeGiroSeed]);

  async function geocodeImportedStops(
    draft: GiroStop[],
  ): Promise<{ stops: GiroStop[]; errors: string[] }> {
    const errors: string[] = [];
    const next: GiroStop[] = [];
    for (const s of draft) {
      const query =
        s.place.address?.trim() ||
        `${s.place.label}, Milano`;
      const { place, error: resolveError } = await resolvePlaceQuery(query);
      if (place) {
        next.push({
          ...s,
          place: {
            ...place,
            label: s.place.label || place.label,
            address: s.place.address ?? place.address,
          },
        });
      } else {
        errors.push(resolveError ?? `Non trovato: ${s.place.label}`);
        next.push(s);
      }
    }
    return { stops: next, errors };
  }

  async function importParsedPiano(parsed: ParsedPianoFermate) {
    const draft = pianoFermateToGiroStops(parsed, () => nanoid());
    const { stops: geocoded, errors } = await geocodeImportedStops(draft);
    setStops(geocoded);
    setLineErrors(errors);
    setSaveTitle(parsed.title);
    setSavedId(null);
    setListText("");
    if (parsed.departureAt) {
      setDepartureLocal(formatDateTimeLocal(parsed.departureAt));
    }
    const entry = saveGiro({
      title: parsed.title,
      origin: start,
      departureAt: parsed.departureAt,
      stops: geocoded,
    });
    setSavedId(entry.id);
    refreshSaved();
    setSaveMessage(
      `Importato e salvato: ${parsed.stops.length} fermate · ${parsed.dateLabel}. Puoi modificare orari e posizioni, poi calcolare.`,
    );
  }

  async function handleImportPdf(file: File) {
    setError(null);
    setLineErrors([]);
    setOrderWarnings([]);
    setSchedule(null);
    setImporting(true);
    try {
      // 1) Prefer client-side extract (works offline / no Vercel PDF crash)
      try {
        const buf = await file.arrayBuffer();
        const { text } = await extractPdfText(buf);
        const parsed = parsePianoFermateText(text);
        if (parsed) {
          await importParsedPiano(parsed);
          return;
        }
      } catch (clientErr) {
        console.warn("[giro] client PDF extract failed, trying API", clientErr);
      }

      // 2) Server fallback
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/giro/import-pdf", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        parsed?: ParsedPianoFermate;
        error?: string;
      };
      if (!res.ok || !data.parsed) {
        setError(
          data.error ??
            (res.status >= 500
              ? "Servizio di import PDF non disponibile. Riprova tra poco."
              : "Import PDF non riuscito."),
        );
        return;
      }
      await importParsedPiano(data.parsed);
    } catch {
      setError(
        "Errore durante l’import del PDF. Usa un «Piano fermate driver» LogiTrack.",
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function updateStop(id: string, patch: Partial<GiroStop>) {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  function removeStop(id: string) {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }

  function addPlace(place: PlaceRef) {
    setStops((prev) => {
      if (prev.some((s) => placeKey(s.place) === placeKey(place))) return prev;
      return [...prev, makeGiroStop(place)];
    });
    setAddKey((k) => k + 1);
  }

  function handleResetGiro() {
    setError(null);
    setLineErrors([]);
    setOrderWarnings([]);
    setSchedule(null);
    setListText("");
    setStops([]);
    setStart(null);
    setExportOrigin(null);
    setSavedId(null);
    setSaveTitle("");
    setSaveMessage(null);
    setDepartureLocal(defaultDepartureLocal());
    setAddKey((k) => k + 1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSaveGiro() {
    setSaveMessage(null);
    if (stops.length < 1 && !start) {
      setError("Aggiungi almeno partenza o una tappa prima di salvare.");
      return;
    }
    const departureAt = localInputToIso(departureLocal);
    const entry = saveGiro({
      id: savedId ?? undefined,
      title: saveTitle,
      origin: start,
      departureAt,
      stops,
    });
    setSavedId(entry.id);
    setSaveTitle(entry.title);
    refreshSaved();
    setSaveMessage(`Salvato: ${entry.title}`);
  }

  function handleLoadGiro(entry: SavedGiro) {
    setError(null);
    setLineErrors([]);
    setOrderWarnings([]);
    setSchedule(null);
    setExportOrigin(null);
    setListText("");
    setSavedId(entry.id);
    setSaveTitle(entry.title);
    setStart(entry.origin);
    setExportOrigin(entry.origin);
    setStops(structuredClone(entry.stops));
    if (entry.departureAt) {
      setDepartureLocal(formatDateTimeLocal(entry.departureAt));
    }
    setSaveMessage(`Caricato: ${entry.title}`);
  }

  function buildExportDoc(): GiroExportDoc | null {
    const origin = exportOrigin ?? start;
    if (!origin || stops.length < 1) return null;
    return {
      title:
        saveTitle.trim() ||
        suggestGiroTitle({ origin, stops }),
      origin,
      departureAt: localInputToIso(departureLocal),
      stops,
      schedule,
    };
  }

  function handleExportPdf() {
    const doc = buildExportDoc();
    if (!doc) {
      setError("Calcola o carica un giro prima di esportare il PDF.");
      return;
    }
    setError(null);
    const maps = buildGiroMapsLink({
      origin: doc.origin,
      stops: doc.stops.map((s) => s.place),
      travelMode,
      preferences,
    });
    const result = exportGiroPdf(doc, maps?.url);
    if (!result.ok) {
      setError("Impossibile esportare il PDF su questo dispositivo.");
      return;
    }
    if (result.mode === "print") {
      setSaveMessage("Apri la stampa e scegli «Salva come PDF».");
    } else {
      setSaveMessage(
        "Foglio scaricato (.html): aprilo e usa Stampa → Salva come PDF.",
      );
    }
  }

  function handleOpenMaps() {
    const doc = buildExportDoc();
    if (!doc) {
      setError("Calcola o carica un giro prima di aprirlo su Maps.");
      return;
    }
    const maps = buildGiroMapsLink({
      origin: doc.origin,
      stops: doc.stops.map((s) => s.place),
      travelMode,
      preferences,
    });
    if (!maps) {
      setError("Serve almeno una tappa per Maps.");
      return;
    }
    openGiroInMaps(maps);
  }

  async function handleShareMaps() {
    const doc = buildExportDoc();
    if (!doc) {
      setError("Calcola o carica un giro prima di condividere.");
      return;
    }
    const maps = buildGiroMapsLink({
      origin: doc.origin,
      stops: doc.stops.map((s) => s.place),
      travelMode,
      preferences,
    });
    if (!maps) {
      setError("Serve almeno una tappa per Maps.");
      return;
    }
    const result = await shareGiroMapsLink({ title: doc.title, link: maps });
    if (result === "copied") {
      setSaveMessage("Link Google Maps copiato.");
    } else if (result === "unsupported") {
      try {
        await navigator.clipboard.writeText(maps.url);
        setSaveMessage("Link Google Maps copiato.");
      } catch {
        openGiroInMaps(maps);
      }
    }
  }

  function handleDeleteSaved(id: string) {
    removeSavedGiro(id);
    if (savedId === id) setSavedId(null);
    refreshSaved();
  }

  async function createGiro() {
    setError(null);
    setLineErrors([]);
    setOrderWarnings([]);
    setSchedule(null);
    setExportOrigin(null);
    setBusy(true);

    try {
      const lines = parseAddressLines(listText);
      const fromLines: GiroStop[] = [];
      const errs: string[] = [];
      const seen = new Set(stops.map((s) => placeKey(s.place)));

      for (const line of lines) {
        const { place, error: resolveError } = await resolvePlaceQuery(line);
        if (place) {
          const key = placeKey(place);
          if (!seen.has(key)) {
            seen.add(key);
            fromLines.push(makeGiroStop(place));
          }
        } else if (resolveError) {
          errs.push(resolveError);
        }
      }
      setLineErrors(errs);

      let working = [...stops, ...fromLines];
      if (fromLines.length > 0) {
        setStops(working);
        setListText("");
      }

      if (working.length < 1) {
        setError("Aggiungi almeno un indirizzo o luogo da visitare.");
        return;
      }

      let origin = start;
      if (!origin) {
        origin = working[0].place;
        working = working.slice(1);
      }
      if (working.length < 1) {
        setError("Serve almeno una tappa oltre alla partenza.");
        return;
      }

      const departureAt = localInputToIso(departureLocal);
      if (!departureAt) {
        setError("Imposta un orario di partenza valido.");
        return;
      }

      const { ordered, warnings } = orderGiroStops(origin, working);
      setOrderWarnings(warnings);
      setStops(ordered);
      setExportOrigin(origin);
      setStart(origin);

      const orderedPlaces = ordered.map((s) => s.place);
      applyGiro({
        origin,
        orderedVisits: orderedPlaces,
        departureAt,
      });

      const middles = orderedPlaces.slice(0, -1);
      const destination = orderedPlaces[orderedPlaces.length - 1];
      // Locks must not be shuffled by Google waypoint optimize
      const allowOptimize =
        middles.length >= 2 && !giroHasHardLocks(ordered);

      const result = await computeRoute({
        origin,
        destination,
        intermediates: middles,
        optimizeWaypointOrder: allowOptimize,
      });

      const state = useTripStore.getState();
      if (!result.ok || state.routes.length === 0) {
        setError(
          state.routeError ??
            "Percorso non calcolato. Controlla gli indirizzi o la chiave Maps.",
        );
        setSchedule(
          buildArrivalSchedule({
            departureAt,
            origin,
            orderedPlaces,
            legs: [],
            orderedGiroStops: ordered,
          }),
        );
        return;
      }

      const route = state.routes[0];
      const rows = buildArrivalSchedule({
        departureAt,
        origin: state.trip.origin ?? origin,
        orderedPlaces,
        legs: route.legs,
        orderedGiroStops: ordered,
      });
      setSchedule(rows);
    } finally {
      setBusy(false);
    }
  }

  const canReset =
    Boolean(start) ||
    stops.length > 0 ||
    listText.trim().length > 0 ||
    Boolean(schedule) ||
    Boolean(savedId) ||
    saveTitle.trim().length > 0 ||
    Boolean(error) ||
    lineErrors.length > 0 ||
    orderWarnings.length > 0 ||
    Boolean(saveMessage);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Giro tappe"
        subtitle="Importa un piano fermate PDF, oppure crea un giro e modificalo"
        action={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canReset || busy || importing}
            onClick={handleResetGiro}
            aria-label="Reset giro"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        }
      />

      <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
          <FileUp className="h-3.5 w-3.5" />
          Importa piano fermate (PDF)
        </p>
        <p className="text-[11px] text-[var(--ink-muted)]">
          Riconosco i PDF «Piano fermate driver» (LogiTrack) con data, orari e
          fermate. Li carico come giro modificabile e li salvo.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportPdf(f);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={importing || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="h-4 w-4" />
          {importing ? "Importo PDF…" : "Scegli PDF fermate"}
        </Button>
      </div>

      <PlaceSearch
        label="Partenza"
        placeholder="Da dove parti?"
        value={start}
        onSelect={setStart}
        onClear={() => setStart(null)}
      />
      <p className="text-[11px] text-[var(--ink-muted)]">
        Se la lasci vuota, uso il primo indirizzo della lista come partenza.
      </p>

      <div>
        <Label>Orario di partenza</Label>
        <Input
          type="datetime-local"
          value={departureLocal}
          onChange={(e) => setDepartureLocal(e.target.value)}
        />
      </div>

      <div>
        <Label>Lista indirizzi (uno per riga)</Label>
        <textarea
          rows={5}
          value={listText}
          onChange={(e) => setListText(e.target.value)}
          placeholder={"Via Roma 1, Milano\nPiazza Duomo, Firenze\n..."}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
        />
        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
          {lineCount > 0
            ? `${lineCount} righe — le aggiungo alle tappe al calcolo`
            : "Incolla o scrivi gli indirizzi"}
        </p>
      </div>

      <PlaceSearch
        key={addKey}
        label="Oppure aggiungi un luogo"
        placeholder="Cerca e aggiungi alla lista…"
        value={null}
        onSelect={(p) => addPlace(p)}
        allowGps={false}
      />

      {stops.length > 0 ? (
        <ul className="space-y-2">
          {stops.map((s, i) => (
            <GiroStopCard
              key={s.id}
              stop={s}
              index={i}
              total={stops.length}
              onChange={(patch) => updateStop(s.id, patch)}
              onRemove={() => removeStop(s.id)}
            />
          ))}
        </ul>
      ) : null}

      {lineErrors.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {lineErrors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}

      {orderWarnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {orderWarnings.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
          <Bookmark className="h-3.5 w-3.5" />
          Salva questo giro
        </p>
        <Input
          placeholder={suggestGiroTitle({ origin: start, stops })}
          value={saveTitle}
          onChange={(e) => setSaveTitle(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleSaveGiro}
        >
          <Save className="h-4 w-4" />
          {savedId ? "Aggiorna giro salvato" : "Salva giro"}
        </Button>
        {saveMessage ? (
          <p className="text-xs text-emerald-700">{saveMessage}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="w-full sm:flex-1"
          disabled={busy}
          onClick={() => void createGiro()}
        >
          <ListOrdered className="h-4 w-4" />
          {busy ? "Creo il percorso…" : "Crea percorso ottimizzato"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={!canReset || busy || importing}
          onClick={handleResetGiro}
        >
          <RotateCcw className="h-4 w-4" />
          Reset giro
        </Button>
      </div>

      {tripHistory.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--line)] pt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
            <History className="h-3.5 w-3.5" />
            Dalla cronologia
          </p>
          <ul className="space-y-1.5">
            {tripHistory.slice(0, 8).map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">
                    {entry.trip.origin?.label ?? "?"} →{" "}
                    {entry.trip.destination?.label ?? "?"}
                  </p>
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    {entry.trip.meta.title}
                    {entry.trip.stops.length > 0
                      ? ` · ${entry.trip.stops.length} tappe`
                      : ""}
                    {" · "}
                    {formatRelativeIt(entry.computedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openTripInGiro(entry.trip)}
                >
                  Apri
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {savedList.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--line)] pt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
            <FolderOpen className="h-3.5 w-3.5" />
            Giri salvati
          </p>
          <ul className="space-y-1.5">
            {savedList.map((g) => (
              <li
                key={g.id}
                className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">
                    {g.title}
                  </p>
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    {g.stops.length} tappe
                    {g.origin ? ` · da ${g.origin.label}` : ""}
                    {" · "}
                    {formatRelativeIt(g.updatedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleLoadGiro(g)}
                >
                  Apri
                </Button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                  onClick={() => handleDeleteSaved(g.id)}
                  aria-label="Elimina giro"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {schedule && schedule.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--line)] pt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
            <Clock3 className="h-3.5 w-3.5" />
            Orari di arrivo
          </p>
          <ol className="space-y-2">
            {schedule.map((row, idx) => (
              <li
                key={`${row.place.id}-${idx}`}
                className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
              >
                <div className="w-14 shrink-0 text-center">
                  <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--brand)]">
                    {formatClockIt(row.arrivalAt)}
                  </p>
                  <p className="text-[10px] font-medium tracking-wide text-[var(--ink-muted)] uppercase">
                    {row.kind === "origin"
                      ? "Parti"
                      : row.kind === "destination"
                        ? "Arrivo"
                        : `Tappa ${idx}`}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {row.place.label}
                  </p>
                  {row.legFromPreviousSeconds > 0 ? (
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                      +{formatDuration(row.legFromPreviousSeconds)} dal punto
                      precedente
                    </p>
                  ) : row.kind === "origin" ? (
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                      Orario di partenza scelto da te
                    </p>
                  ) : null}
                  {row.arriveBy ? (
                    <p
                      className={cn(
                        "mt-1 text-[11px] font-medium",
                        (row.vsArriveBySeconds ?? 0) > 60
                          ? "text-red-700"
                          : (row.vsArriveBySeconds ?? 0) < -60
                            ? "text-emerald-700"
                            : "text-[var(--ink-muted)]",
                      )}
                    >
                      Appuntamento {formatClockIt(row.arriveBy)}
                      {row.vsArriveBySeconds != null
                        ? row.vsArriveBySeconds > 60
                          ? ` · in ritardo ${formatDuration(row.vsArriveBySeconds)}`
                          : row.vsArriveBySeconds < -60
                            ? ` · in anticipo ${formatDuration(-row.vsArriveBySeconds)}`
                            : " · in orario"
                        : null}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportPdf}
            >
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
            <Button type="button" variant="outline" onClick={handleOpenMaps}>
              <ExternalLink className="h-4 w-4" />
              Maps
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleShareMaps()}
            >
              <Share2 className="h-4 w-4" />
              Condividi
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => setActivePanel("summary")}
          >
            Vedi percorso sulla mappa
          </Button>
        </div>
      ) : (
        <EmptyHint>
          Su ogni tappa puoi impostare un orario e bloccarla (ultima, 3ª,
          9ª…). Poi calcola il percorso.
        </EmptyHint>
      )}

      {!schedule && (exportOrigin ?? start) && stops.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 border-t border-[var(--line)] pt-3 sm:grid-cols-3">
          <Button type="button" variant="outline" onClick={handleExportPdf}>
            <FileDown className="h-4 w-4" />
            PDF
          </Button>
          <Button type="button" variant="outline" onClick={handleOpenMaps}>
            <ExternalLink className="h-4 w-4" />
            Maps
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleShareMaps()}
          >
            <Share2 className="h-4 w-4" />
            Condividi
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function GiroStopCard({
  stop,
  index,
  total,
  onChange,
  onRemove,
}: {
  stop: GiroStop;
  index: number;
  total: number;
  onChange: (patch: Partial<GiroStop>) => void;
  onRemove: () => void;
}) {
  const lockValue =
    stop.positionLock === "auto"
      ? "auto"
      : stop.positionLock === "last"
        ? "last"
        : String(stop.positionLock);

  function onLockChange(value: string) {
    let positionLock: GiroPositionLock = "auto";
    if (value === "last") positionLock = "last";
    else if (value !== "auto") positionLock = Number(value);
    onChange({ positionLock });
  }

  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            <span className="mr-1.5 text-[var(--ink-muted)]">{index + 1}.</span>
            {stop.place.label}
          </p>
          {stop.place.address ? (
            <p className="truncate text-[11px] text-[var(--ink-muted)]">
              {stop.place.address}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          onClick={onRemove}
          aria-label="Rimuovi"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Orario in questa tappa</Label>
          <Input
            type="datetime-local"
            value={
              stop.arriveBy ? formatDateTimeLocal(stop.arriveBy) : ""
            }
            onChange={(e) =>
              onChange({
                arriveBy: e.target.value
                  ? localInputToIso(e.target.value)
                  : null,
              })
            }
          />
        </div>
        <div>
          <Label>Posizione nel giro</Label>
          <select
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
            value={lockValue}
            onChange={(e) => onLockChange(e.target.value)}
          >
            <option value="auto">Libera (per vicinanza)</option>
            <option value="last">Sempre ultima</option>
            {Array.from({ length: total }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                Fissa come {i + 1}ª tappa
              </option>
            ))}
          </select>
        </div>
      </div>
    </li>
  );
}
