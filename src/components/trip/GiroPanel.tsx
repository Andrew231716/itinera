"use client";

import { useMemo, useState } from "react";
import { Clock3, ListOrdered, MapPin, Trash2 } from "lucide-react";
import { PlaceSearch } from "@/components/trip/PlaceSearch";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import {
  parseAddressLines,
  resolvePlaceQuery,
} from "@/lib/places/resolve-query";
import {
  applyOptimizedIntermediateOrder,
  buildArrivalSchedule,
  orderPlacesByNearestNeighbor,
  type ScheduleStop,
} from "@/lib/routing/travel-schedule";
import {
  formatClockIt,
  formatDateTimeLocal,
  formatDuration,
  localInputToIso,
} from "@/lib/utils/format";
import type { PlaceRef } from "@/lib/types/trip";
import {
  Button,
  EmptyHint,
  Input,
  Label,
  SectionTitle,
} from "@/components/ui/primitives";

/**
 * Paste a list of addresses → order by proximity → route with arrival times.
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
  const [resolved, setResolved] = useState<PlaceRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ScheduleStop[] | null>(null);
  const [addKey, setAddKey] = useState(0);

  const lineCount = useMemo(
    () => parseAddressLines(listText).length,
    [listText],
  );

  function removeResolved(id: string) {
    setResolved((prev) => prev.filter((p) => p.id !== id));
  }

  async function addFromSearch(place: PlaceRef) {
    setResolved((prev) =>
      prev.some((p) => p.id === place.id) ? prev : [...prev, place],
    );
    setAddKey((k) => k + 1);
  }

  async function createGiro() {
    setError(null);
    setLineErrors([]);
    setSchedule(null);
    setBusy(true);

    try {
      const lines = parseAddressLines(listText);
      const fromLines: PlaceRef[] = [];
      const errs: string[] = [];

      for (const line of lines) {
        const { place, error: resolveError } = await resolvePlaceQuery(line);
        if (place) fromLines.push(place);
        else if (resolveError) errs.push(resolveError);
      }
      setLineErrors(errs);

      const visits = dedupePlaces([...resolved, ...fromLines]);
      if (visits.length < 1) {
        setError("Aggiungi almeno un indirizzo o luogo da visitare.");
        return;
      }

      let origin = start;
      let toVisit = visits;
      if (!origin) {
        origin = visits[0];
        toVisit = visits.slice(1);
      }
      if (toVisit.length < 1) {
        setError("Serve almeno una tappa oltre alla partenza.");
        return;
      }

      const departureAt = localInputToIso(departureLocal);
      if (!departureAt) {
        setError("Imposta un orario di partenza valido.");
        return;
      }

      const ordered = orderPlacesByNearestNeighbor(origin, toVisit);
      applyGiro({ origin, orderedVisits: ordered, departureAt });

      const middles = ordered.slice(0, -1);
      const destination = ordered[ordered.length - 1];
      const result = await computeRoute({
        origin,
        destination,
        intermediates: middles,
        optimizeWaypointOrder: middles.length >= 2,
      });

      const state = useTripStore.getState();
      if (!result.ok || state.routes.length === 0) {
        setError(
          state.routeError ??
            "Percorso non calcolato. Controlla gli indirizzi o la chiave Maps.",
        );
        // Still show proximity order without times
        setSchedule(
          buildArrivalSchedule({
            departureAt,
            origin,
            orderedPlaces: ordered,
            legs: [],
          }),
        );
        return;
      }

      const finalMiddles = applyOptimizedIntermediateOrder(
        state.trip.stops.map((s) => s.place),
        result.optimizedIntermediateOrder,
      );
      const finalOrdered = [
        ...finalMiddles,
        state.trip.destination ?? destination,
      ].filter(Boolean) as PlaceRef[];

      const route = state.routes[0];
      const rows = buildArrivalSchedule({
        departureAt,
        origin: state.trip.origin ?? origin,
        orderedPlaces: finalOrdered,
        legs: route.legs,
      });
      setSchedule(rows);
      setResolved(finalOrdered);
      setListText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Giro tappe"
        subtitle="Incolla una lista di indirizzi: li ordino per vicinanza e ti dico a che ora arrivi"
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
          rows={6}
          value={listText}
          onChange={(e) => setListText(e.target.value)}
          placeholder={"Via Roma 1, Milano\nPiazza Duomo, Firenze\n..."}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
        />
        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
          {lineCount > 0 ? `${lineCount} righe` : "Incolla o scrivi gli indirizzi"}
        </p>
      </div>

      <PlaceSearch
        key={addKey}
        label="Oppure aggiungi un luogo"
        placeholder="Cerca e aggiungi alla lista…"
        value={null}
        onSelect={(p) => void addFromSearch(p)}
        allowGps={false}
      />

      {resolved.length > 0 ? (
        <ul className="space-y-1.5">
          {resolved.map((p, i) => (
            <li
              key={`${p.id}-${i}`}
              className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />
              <span className="min-w-0 flex-1 text-sm text-[var(--ink)]">
                {p.label}
                {p.address ? (
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-muted)]">
                    {p.address}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                onClick={() => removeResolved(p.id)}
                aria-label="Rimuovi"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
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

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Button
        type="button"
        className="w-full"
        disabled={busy}
        onClick={() => void createGiro()}
      >
        <ListOrdered className="h-4 w-4" />
        {busy ? "Creo il percorso…" : "Crea percorso ottimizzato"}
      </Button>

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
                  ) : (
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                      Orario stimato (senza tempi di tratta)
                    </p>
                  )}
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
          Dopo il calcolo vedi qui l’ordine delle tappe e l’ora stimata in ogni
          indirizzo.
        </EmptyHint>
      )}
    </div>
  );
}

function dedupePlaces(places: PlaceRef[]): PlaceRef[] {
  const seen = new Set<string>();
  const out: PlaceRef[] = [];
  for (const p of places) {
    const key = p.placeId ?? `${p.location.lat.toFixed(5)},${p.location.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
