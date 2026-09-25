"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  CarFront,
  Heart,
  Home,
  Briefcase,
  MapPin,
  Trash2,
  Navigation,
  History,
  Eraser,
} from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import {
  listSavedPlaces,
  removeSavedPlace,
  saveSavedPlace,
  savedPlaceKindLabel,
  type SavedPlace,
  type SavedPlaceKind,
} from "@/lib/storage/saved-places";
import {
  formatDistance,
  formatDuration,
  formatCurrency,
  formatRelativeIt,
} from "@/lib/utils/format";
import {
  Badge,
  Button,
  EmptyHint,
  Input,
  Label,
  SectionTitle,
} from "@/components/ui/primitives";
import { PlaceSearch } from "@/components/trip/PlaceSearch";

const KINDS: Array<{ id: SavedPlaceKind; label: string; icon: typeof Heart }> = [
  { id: "parking", label: "Parcheggio", icon: CarFront },
  { id: "favorite", label: "Preferito", icon: Heart },
  { id: "home", label: "Casa", icon: Home },
  { id: "work", label: "Lavoro", icon: Briefcase },
  { id: "other", label: "Altro", icon: MapPin },
];

export function SavedPanel() {
  const trip = useTripStore((s) => s.trip);
  const savedTrips = useTripStore((s) => s.savedTrips);
  const tripHistory = useTripStore((s) => s.tripHistory);
  const loadTrip = useTripStore((s) => s.loadTrip);
  const persistTrip = useTripStore((s) => s.persistTrip);
  const refreshSavedTrips = useTripStore((s) => s.refreshSavedTrips);
  const refreshTripHistory = useTripStore((s) => s.refreshTripHistory);
  const removeSavedTrip = useTripStore((s) => s.removeSavedTrip);
  const loadHistoryEntry = useTripStore((s) => s.loadHistoryEntry);
  const removeHistoryEntry = useTripStore((s) => s.removeHistoryEntry);
  const clearHistory = useTripStore((s) => s.clearHistory);
  const resetTrip = useTripStore((s) => s.resetTrip);
  const duplicateCurrentTrip = useTripStore((s) => s.duplicateCurrentTrip);
  const setOrigin = useTripStore((s) => s.setOrigin);
  const setDestination = useTripStore((s) => s.setDestination);
  const addStop = useTripStore((s) => s.addStop);
  const setTitle = useTripStore((s) => s.setTitle);

  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [kind, setKind] = useState<SavedPlaceKind>("parking");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<SavedPlaceKind | "all">("all");

  function reloadPlaces() {
    setPlaces(listSavedPlaces());
  }

  useEffect(() => {
    reloadPlaces();
    void refreshSavedTrips();
    refreshTripHistory();
  }, [refreshSavedTrips, refreshTripHistory]);

  const filteredPlaces = useMemo(
    () =>
      filter === "all" ? places : places.filter((p) => p.kind === filter),
    [places, filter],
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Salvati"
        subtitle="Cronologia automatica, viaggi memorizzati e posti preferiti"
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
            <History className="h-4 w-4 text-[var(--brand)]" />
            Cronologia viaggi
          </h3>
          {tripHistory.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (
                  window.confirm(
                    "Vuoi cancellare tutta la cronologia dei percorsi calcolati?",
                  )
                ) {
                  clearHistory();
                }
              }}
            >
              <Eraser className="h-3.5 w-3.5" />
              Svuota
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
          Si aggiorna automaticamente a ogni «Calcola percorso». I viaggi
          salvati restano separati (pin manuale sotto).
        </p>

        {tripHistory.length === 0 ? (
          <EmptyHint>
            Nessun percorso in cronologia. Calcola un itinerario per
            registrarlo qui.
          </EmptyHint>
        ) : (
          <ul className="space-y-2">
            {tripHistory.map((entry) => {
              const rs = entry.routeSummary;
              return (
                <li
                  key={entry.id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => loadHistoryEntry(entry)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--ink)]">
                        {entry.trip.origin?.label ?? "?"} →{" "}
                        {entry.trip.destination?.label ?? "?"}
                      </p>
                      <span className="shrink-0 text-[10px] text-[var(--ink-faint)]">
                        {formatRelativeIt(entry.computedAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                      {entry.trip.meta.title}
                      {entry.trip.stops.length > 0
                        ? ` · ${entry.trip.stops.length} tappe`
                        : ""}
                      {rs?.distanceMeters != null
                        ? ` · ${formatDistance(rs.distanceMeters)}`
                        : ""}
                      {rs?.durationSeconds != null
                        ? ` · ${formatDuration(rs.durationSeconds)}`
                        : ""}
                      {rs?.tollEstimate != null
                        ? ` · ${formatCurrency(
                            rs.tollEstimate,
                            rs.tollCurrency ?? "EUR",
                          )}`
                        : ""}
                    </p>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => loadHistoryEntry(entry)}
                    >
                      Riapri
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        loadHistoryEntry(entry);
                        void persistTrip().then(() => refreshSavedTrips());
                      }}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      Salva
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeHistoryEntry(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Elimina
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3 border-t border-[var(--line)] pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Viaggi salvati
          </h3>
          <Button
            type="button"
            size="sm"
            onClick={() => void persistTrip().then(() => refreshSavedTrips())}
          >
            <Bookmark className="h-3.5 w-3.5" />
            Salva viaggio attuale
          </Button>
        </div>

        {savedTrips.length === 0 ? (
          <EmptyHint>
            Nessun viaggio salvato. Imposta partenza/arrivo e tocca «Salva
            viaggio attuale», oppure salva dalla cronologia.
          </EmptyHint>
        ) : (
          <ul className="space-y-2">
            {savedTrips.map((t) => (
              <li
                key={t.meta.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => loadTrip(t)}
                >
                  <p className="text-sm font-medium text-[var(--ink)]">
                    {t.meta.title}
                    {t.meta.id === trip.meta.id ? " · aperto" : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                    {t.origin?.label ?? "?"} → {t.destination?.label ?? "?"}
                    {t.stops.length > 0
                      ? ` · ${t.stops.length} tappe`
                      : ""}
                  </p>
                </button>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => loadTrip(t)}
                  >
                    Apri
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeSavedTrip(t.meta.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Elimina
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void duplicateCurrentTrip()}
          >
            Duplica attuale
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={resetTrip}>
            Nuovo viaggio
          </Button>
        </div>
      </section>

      <section className="space-y-3 border-t border-[var(--line)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Parcheggi e posti preferiti
        </h3>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => {
              const Icon = k.icon;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    kind === k.id
                      ? "bg-[var(--brand)] text-white"
                      : "bg-[var(--surface)] text-[var(--ink-muted)]"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {k.label}
                </button>
              );
            })}
          </div>
          <div>
            <Label>Nome (opzionale)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                kind === "parking" ? "Es. Garage Como centro" : "Es. Casa mamma"
              }
            />
          </div>
          <div>
            <Label>Nota</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Piano, codice, orario…"
            />
          </div>
          <PlaceSearch
            label="Cerca o usa GPS"
            value={null}
            onSelect={(place) => {
              saveSavedPlace({
                kind,
                label: label.trim() || place.label,
                note: note.trim() || undefined,
                place,
              });
              setLabel("");
              setNote("");
              reloadPlaces();
            }}
          />
          {(trip.origin || trip.destination) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {trip.origin ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    saveSavedPlace({
                      kind,
                      label: label.trim() || trip.origin!.label,
                      note: note.trim() || undefined,
                      place: trip.origin!,
                    });
                    setLabel("");
                    setNote("");
                    reloadPlaces();
                  }}
                >
                  Salva partenza attuale
                </Button>
              ) : null}
              {trip.destination ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    saveSavedPlace({
                      kind,
                      label: label.trim() || trip.destination!.label,
                      note: note.trim() || undefined,
                      place: trip.destination!,
                    });
                    setLabel("");
                    setNote("");
                    reloadPlaces();
                  }}
                >
                  Salva destinazione attuale
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
              filter === "all"
                ? "bg-[var(--brand)] text-white"
                : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
            }`}
          >
            Tutti
          </button>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setFilter(k.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                filter === k.id
                  ? "bg-[var(--brand)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {filteredPlaces.length === 0 ? (
          <EmptyHint>
            Nessun posto salvato in questa categoria. Aggiungine uno sopra.
          </EmptyHint>
        ) : (
          <ul className="space-y-2">
            {filteredPlaces.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {p.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                      <Badge tone="neutral">{savedPlaceKindLabel(p.kind)}</Badge>{" "}
                      {p.place.address || p.place.label}
                    </p>
                    {p.note ? (
                      <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                        {p.note}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Elimina posto"
                    className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-2)] hover:text-red-600"
                    onClick={() => {
                      removeSavedPlace(p.id);
                      reloadPlaces();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setOrigin(p.place)}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Partenza
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDestination(p.place)}
                  >
                    Arrivo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => addStop(p.place)}
                  >
                    + Tappa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setTitle(p.label)}
                  >
                    Usa come titolo
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
