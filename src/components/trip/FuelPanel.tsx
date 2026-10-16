"use client";

import {
  ExternalLink,
  Fuel,
  Navigation,
  Phone,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import type { FuelSearchResult, FuelStation } from "@/lib/fuel/types";
import { amenityLabel } from "@/lib/fuel/helpers";
import { formatDistance } from "@/lib/utils/format";
import {
  Badge,
  Button,
  EmptyHint,
  Input,
  SectionTitle,
} from "@/components/ui/primitives";

export function FuelPanel() {
  const trip = useTripStore((s) => s.trip);
  const fuelCenter = useTripStore((s) => s.fuelCenter);
  const fuelSearchNonce = useTripStore((s) => s.fuelSearchNonce);
  const fuelStations = useTripStore((s) => s.fuelStations);
  const selectedFuelId = useTripStore((s) => s.selectedFuelId);
  const setFuelStations = useTripStore((s) => s.setFuelStations);
  const selectFuel = useTripStore((s) => s.selectFuel);
  const applySelectedFuel = useTripStore((s) => s.applySelectedFuel);
  const requestFuelNear = useTripStore((s) => s.requestFuelNear);

  const [adblue, setAdblue] = useState(true);
  const [open24h, setOpen24h] = useState(false);
  const [truck, setTruck] = useState(false);
  const [radius, setRadius] = useState(8000);
  const [query, setQuery] = useState("");
  const [alongRoute, setAlongRoute] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const [limitations, setLimitations] = useState<string[]>([]);

  const center = useMemo(() => {
    if (alongRoute && trip.origin?.location && trip.destination?.location) {
      return {
        lat: trip.origin.location.lat,
        lng: trip.origin.location.lng,
        label: `${trip.origin.label} → ${trip.destination.label}`,
        kind: "tratta" as const,
      };
    }
    if (fuelCenter) return { ...fuelCenter, kind: "ricerca" as const };
    if (trip.destination?.location) {
      return {
        lat: trip.destination.location.lat,
        lng: trip.destination.location.lng,
        label: trip.destination.label,
        kind: "destinazione" as const,
      };
    }
    if (trip.origin?.location) {
      return {
        lat: trip.origin.location.lat,
        lng: trip.origin.location.lng,
        label: trip.origin.label,
        kind: "partenza" as const,
      };
    }
    return {
      lat: 45.358,
      lng: 9.324,
      label: "Melegnano (esempio)",
      kind: "esempio" as const,
    };
  }, [fuelCenter, trip.origin, trip.destination, alongRoute]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        lat: String(center.lat),
        lng: String(center.lng),
        radius: String(radius),
        label: center.label,
      });
      if (query.trim()) params.set("q", query.trim());
      if (adblue) params.set("adblue", "1");
      if (open24h) params.set("open24h", "1");
      if (truck) params.set("truck", "1");
      if (alongRoute && trip.origin?.location && trip.destination?.location) {
        params.set("lat", String(trip.origin.location.lat));
        params.set("lng", String(trip.origin.location.lng));
        params.set("alongLat", String(trip.destination.location.lat));
        params.set("alongLng", String(trip.destination.location.lng));
        params.set(
          "label",
          `${trip.origin.label} → ${trip.destination.label}`,
        );
      }

      const res = await fetch(`/api/fuel/nearby?${params.toString()}`);
      const data = (await res.json()) as FuelSearchResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ricerca benzinai non riuscita.");
      setFuelStations(data.stations);
      setAdvice(data.advice ?? null);
      setLimitations(data.limitations ?? []);
    } catch (err) {
      setFuelStations([]);
      setAdvice(null);
      setError(err instanceof Error ? err.message : "Errore di ricerca.");
    } finally {
      setLoading(false);
    }
  }, [
    center,
    radius,
    query,
    adblue,
    open24h,
    truck,
    alongRoute,
    trip.origin,
    trip.destination,
    setFuelStations,
  ]);

  useEffect(() => {
    void load();
  }, [load, fuelSearchNonce]);

  function useGps() {
    if (!navigator.geolocation) {
      setError("Geolocalizzazione non disponibile.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requestFuelNear({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Posizione GPS",
        });
      },
      () => setError("Impossibile ottenere la posizione GPS."),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  const selected = fuelStations.find((s) => s.id === selectedFuelId) ?? null;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Benzinai"
        subtitle="Distributori con dettagli (AdBlue, telefono, orari) da OSM e Google Maps"
      />

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
        Centro:{" "}
        <span className="font-medium text-[var(--ink)]">{center.label}</span>
        <span className="text-[var(--ink-faint)]"> · {center.kind}</span>
        <p className="mt-1">
          Elenco pratico con AdBlue segnalato, telefono e link Maps. Conferma
          sempre telefonando.
        </p>
      </div>

      {trip.origin && trip.destination ? (
        <label className="flex items-center gap-2 text-xs text-[var(--ink)]">
          <input
            type="checkbox"
            checked={alongRoute}
            onChange={(e) => setAlongRoute(e.target.checked)}
          />
          Cerca lungo la tratta {trip.origin.label} → {trip.destination.label}
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={adblue}
          onClick={() => setAdblue((v) => !v)}
          label="AdBlue"
        />
        <FilterChip
          active={open24h}
          onClick={() => setOpen24h((v) => !v)}
          label="H24"
        />
        <FilterChip
          active={truck}
          onClick={() => setTruck((v) => !v)}
          label="Camion"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={useGps}>
          <Navigation className="h-3.5 w-3.5" />
          GPS
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[var(--ink-faint)]" />
          <Input
            className="pl-9"
            placeholder="Es. Q8, Eni, AdBlue…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </div>
        <select
          className="h-10 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 text-xs"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          aria-label="Raggio"
        >
          <option value={3000}>3 km</option>
          <option value={5000}>5 km</option>
          <option value={8000}>8 km</option>
          <option value={15000}>15 km</option>
        </select>
      </div>

      {advice ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          {advice}
        </div>
      ) : null}

      {selected ? (
        <div className="space-y-2 rounded-xl border border-[var(--brand)]/40 bg-[var(--brand-soft)]/40 p-3">
          <p className="text-xs font-semibold text-[var(--ink)]">
            Selezionato: {selected.name}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => applySelectedFuel("stop")}
            >
              Aggiungi come tappa
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => applySelectedFuel("destination")}
            >
              Usa come destinazione
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading && fuelStations.length === 0 ? (
        <EmptyHint>Ricerca distributori in corso…</EmptyHint>
      ) : null}

      {!loading && fuelStations.length === 0 ? (
        <EmptyHint>
          Nessun risultato con questi filtri. Prova ad allargare il raggio o
          togliere AdBlue.
        </EmptyHint>
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Distributori da provare
        </p>
        {fuelStations.map((station, index) => (
          <FuelCard
            key={station.id}
            index={index + 1}
            station={station}
            selected={station.id === selectedFuelId}
            onSelect={() => selectFuel(station.id)}
          />
        ))}
      </div>

      {limitations.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          <ul className="list-disc space-y-0.5 pl-4">
            {limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-[var(--brand)] text-white"
          : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
      }`}
    >
      {label}
    </button>
  );
}

function FuelCard({
  station,
  index,
  selected,
  onSelect,
}: {
  station: FuelStation;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const amenityChips = (
    Object.entries(station.amenities) as Array<
      [keyof typeof station.amenities, string]
    >
  )
    .filter(([, v]) => v === "yes")
    .map(([k]) => amenityLabel(k));

  return (
    <article
      className={`rounded-xl border px-3 py-3 ${
        selected
          ? "border-[var(--brand)] bg-[var(--brand-soft)]/30 ring-1 ring-[var(--brand)]/30"
          : "border-[var(--line)] bg-[var(--surface)]"
      }`}
    >
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Fuel className="h-4 w-4 shrink-0 text-[var(--brand)]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                {index}. {station.name}
              </h3>
            </div>
            {station.address ? (
              <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                {station.address}
              </p>
            ) : null}
          </div>
          <Badge tone={station.amenities.adblue === "yes" ? "ok" : "neutral"}>
            {formatDistance(station.distanceMeters)}
          </Badge>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {amenityChips.map((chip) => (
            <span
              key={chip}
              className="rounded-md bg-[var(--brand-soft)] px-1.5 py-0.5 text-[var(--brand)]"
            >
              {chip}
            </span>
          ))}
          {station.sources.map((s) => (
            <span
              key={s}
              className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--ink-muted)]"
            >
              {s === "google_maps" ? "Google" : s === "openstreetmap" ? "OSM" : s}
            </span>
          ))}
          {station.openNow != null ? (
            <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--ink-muted)]">
              {station.openNow ? "Aperto ora" : "Chiuso ora"}
            </span>
          ) : null}
        </div>

        {station.notes.map((n) => (
          <p key={n} className="mt-1 text-xs text-[var(--ink)]">
            {n}
          </p>
        ))}

        {station.phone ? (
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Telefono: {station.phone}
          </p>
        ) : null}
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={station.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 text-xs font-medium text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Apri in Google Maps
        </a>
        {station.phone ? (
          <a
            href={`tel:${station.phone.replace(/\s/g, "")}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--ink)]"
          >
            <Phone className="h-3.5 w-3.5" />
            Chiama
          </a>
        ) : null}
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-xs font-medium text-[var(--ink-muted)]"
        >
          Seleziona
        </button>
      </div>
    </article>
  );
}
