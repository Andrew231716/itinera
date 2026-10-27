"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Clock3,
  FolderOpen,
  ListOrdered,
  MapPin,
  Save,
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

/**
 * Paste / search addresses → order by proximity (with locks) → ETA per stop.
 */
export function GiroPanel() {
  const applyGiro = useTripStore((s) => s.applyGiro);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const tripOrigin = useTripStore((s) => s.trip.origin);
  const { computeRoute } = useRouteCompute();

  const [start, setStart] = useState<PlaceRef | null>(tripOrigin);
  const [departureLocal, setDepartureLocal] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return formatDateTimeLocal(d.toISOString());
  });
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

  const lineCount = useMemo(
    () => parseAddressLines(listText).length,
    [listText],
  );

  function refreshSaved() {
    setSavedList(listSavedGiri());
  }

  useEffect(() => {
    refreshSaved();
  }, []);

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
    setListText("");
    setSavedId(entry.id);
    setSaveTitle(entry.title);
    setStart(entry.origin);
    setStops(structuredClone(entry.stops));
    if (entry.departureAt) {
      setDepartureLocal(formatDateTimeLocal(entry.departureAt));
    }
    setSaveMessage(`Caricato: ${entry.title}`);
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

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Giro tappe"
        subtitle="Lista indirizzi, orari sulle tappe e posizioni bloccate (ultima, 9ª…)"
      />

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

      <Button
        type="button"
        className="w-full"
        disabled={busy}
        onClick={() => void createGiro()}
      >
        <ListOrdered className="h-4 w-4" />
        {busy ? "Creo il percorso…" : "Crea percorso ottimizzato"}
      </Button>

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
