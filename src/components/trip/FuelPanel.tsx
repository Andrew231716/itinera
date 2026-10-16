"use client";

import {
  ExternalLink,
  Fuel,
  Heart,
  Navigation,
  Phone,
  RefreshCw,
  Route,
  Search,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import type { FuelSearchResult, FuelStation } from "@/lib/fuel/types";
import { KNOWN_FUEL_BRANDS } from "@/lib/fuel/types";
import {
  amenityLabel,
  mapsDirectionsUrl,
  pickHighlightPrices,
} from "@/lib/fuel/helpers";
import { fuelStationToPlaceRef } from "@/lib/fuel/place-ref";
import {
  listSavedPlaces,
  removeSavedPlace,
  saveSavedPlace,
  type SavedPlace,
} from "@/lib/storage/saved-places";
import { formatDistance } from "@/lib/utils/format";

function formatFuelPrice(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount);
}
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
  const [brand, setBrand] = useState("");
  const [radius, setRadius] = useState(8000);
  const [query, setQuery] = useState("");
  const [alongRoute, setAlongRoute] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [brandsAvailable, setBrandsAvailable] = useState<
    FuelSearchResult["brandsAvailable"]
  >([]);
  const [favorites, setFavorites] = useState<SavedPlace[]>([]);

  useEffect(() => {
    if (fuelCenter) setAlongRoute(false);
    else if (trip.origin && trip.destination) setAlongRoute(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on nonce
  }, [fuelSearchNonce]);

  const reloadFavorites = useCallback(() => {
    setFavorites(listSavedPlaces().filter((p) => p.kind === "fuel"));
  }, []);

  useEffect(() => {
    reloadFavorites();
  }, [reloadFavorites]);

  const useCorridor = Boolean(
    alongRoute && trip.origin?.location && trip.destination?.location,
  );

  const center = useMemo(() => {
    if (useCorridor && trip.origin && trip.destination) {
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
  }, [fuelCenter, trip.origin, trip.destination, useCorridor]);

  const directionsOrigin = useMemo(() => {
    if (trip.origin?.location) return trip.origin.location;
    if (fuelCenter) return { lat: fuelCenter.lat, lng: fuelCenter.lng };
    return null;
  }, [trip.origin, fuelCenter]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
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
        if (brand) params.set("brand", brand);
        if (
          useCorridor &&
          trip.origin?.location &&
          trip.destination?.location
        ) {
          params.set("lat", String(trip.origin.location.lat));
          params.set("lng", String(trip.origin.location.lng));
          params.set("alongLat", String(trip.destination.location.lat));
          params.set("alongLng", String(trip.destination.location.lng));
          params.set(
            "label",
            `${trip.origin.label} → ${trip.destination.label}`,
          );
        }

        const res = await fetch(`/api/fuel/nearby?${params.toString()}`, {
          signal,
        });
        const data = (await res.json()) as FuelSearchResult & {
          error?: string;
        };
        if (signal?.aborted) return;
        if (!res.ok) {
          throw new Error(data.error ?? "Ricerca benzinai non riuscita.");
        }
        setFuelStations(data.stations);
        setAdvice(data.advice ?? null);
        setLimitations(data.limitations ?? []);
        setBrandsAvailable(data.brandsAvailable ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFuelStations([]);
        setAdvice(null);
        setBrandsAvailable([]);
        setError(err instanceof Error ? err.message : "Errore di ricerca.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [
      center,
      radius,
      query,
      adblue,
      open24h,
      truck,
      brand,
      useCorridor,
      trip.origin,
      trip.destination,
      setFuelStations,
    ],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
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

  function toggleFavorite(station: FuelStation) {
    const existing = favorites.find(
      (f) =>
        Math.abs(f.place.location.lat - station.location.lat) < 1e-5 &&
        Math.abs(f.place.location.lng - station.location.lng) < 1e-5,
    );
    if (existing) {
      removeSavedPlace(existing.id);
    } else {
      const petrol = station.prices?.find(
        (p) => /benzina/i.test(p.fuel) && p.isSelf,
      );
      const diesel = station.prices?.find(
        (p) => /gasolio/i.test(p.fuel) && p.isSelf,
      );
      const noteParts = [
        station.brand,
        petrol ? `Benzina ${petrol.price.toFixed(3)}€` : null,
        diesel ? `Gasolio ${diesel.price.toFixed(3)}€` : null,
        station.amenities.adblue === "yes" ? "AdBlue" : null,
      ].filter(Boolean);
      saveSavedPlace({
        kind: "fuel",
        label: station.name,
        note: noteParts.join(" · ") || undefined,
        place: fuelStationToPlaceRef(station),
      });
    }
    reloadFavorites();
  }

  function isFavorite(station: FuelStation): boolean {
    return favorites.some(
      (f) =>
        Math.abs(f.place.location.lat - station.location.lat) < 1e-5 &&
        Math.abs(f.place.location.lng - station.location.lng) < 1e-5,
    );
  }

  const selected =
    fuelStations.find((s) => s.id === selectedFuelId) ?? null;

  const brandChips = useMemo(() => {
    const fromResults = brandsAvailable.map((b) => b.key);
    const known = KNOWN_FUEL_BRANDS.map((b) => b.key);
    const keys = Array.from(new Set([...fromResults, ...known]));
    return keys
      .map((key) => {
        const found = brandsAvailable.find((b) => b.key === key);
        const knownLabel =
          KNOWN_FUEL_BRANDS.find((b) => b.key === key)?.label ?? key;
        return {
          key,
          label: found?.label ?? knownLabel,
          count: found?.count ?? 0,
        };
      })
      .filter((b) => b.count > 0 || KNOWN_FUEL_BRANDS.some((k) => k.key === b.key))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 10);
  }, [brandsAvailable]);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Benzinai"
        subtitle="Prezzi MIMIT, AdBlue, telefono e indicazioni — OSM + Google + Osservaprezzi"
      />

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
        Centro:{" "}
        <span className="font-medium text-[var(--ink)]">{center.label}</span>
        <span className="text-[var(--ink-faint)]"> · {center.kind}</span>
        <p className="mt-1">
          Prezzi ufficiali da Osservaprezzi Carburanti. Conferma sempre AdBlue e
          disponibilità telefonando.
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

      {brandChips.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Brand
          </p>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={!brand}
              onClick={() => setBrand("")}
              label="Tutti"
            />
            {brandChips.map((b) => (
              <FilterChip
                key={b.key}
                active={brand === b.key}
                onClick={() => setBrand((cur) => (cur === b.key ? "" : b.key))}
                label={b.count ? `${b.label} (${b.count})` : b.label}
              />
            ))}
          </div>
        </div>
      ) : null}

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
            {directionsOrigin ? (
              <a
                href={mapsDirectionsUrl({
                  origin: directionsOrigin,
                  destination: selected.location,
                  destinationLabel: selected.name,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 text-xs font-medium text-white"
              >
                <Route className="h-3.5 w-3.5" />
                Indicazioni
              </a>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => toggleFavorite(selected)}
            >
              <Heart className="h-3.5 w-3.5" />
              {isFavorite(selected) ? "Togli dai preferiti" : "Salva preferito"}
            </Button>
          </div>
        </div>
      ) : null}

      {favorites.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            <Star className="h-3 w-3" />
            Benzinai preferiti
          </p>
          {favorites.map((fav) => (
            <button
              key={fav.id}
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              onClick={() =>
                requestFuelNear({
                  lat: fav.place.location.lat,
                  lng: fav.place.location.lng,
                  label: fav.label,
                })
              }
            >
              <span>
                <span className="font-medium text-[var(--ink)]">{fav.label}</span>
                {fav.note ? (
                  <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">
                    {fav.note}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] text-[var(--brand)]">Apri zona</span>
            </button>
          ))}
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
          togliere AdBlue / brand.
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
            favorite={isFavorite(station)}
            directionsOrigin={directionsOrigin}
            onSelect={() => selectFuel(station.id)}
            onToggleFavorite={() => toggleFavorite(station)}
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
  favorite,
  directionsOrigin,
  onSelect,
  onToggleFavorite,
}: {
  station: FuelStation;
  index: number;
  selected: boolean;
  favorite: boolean;
  directionsOrigin: { lat: number; lng: number } | null;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const amenityChips = (
    Object.entries(station.amenities) as Array<
      [keyof typeof station.amenities, string]
    >
  )
    .filter(([, v]) => v === "yes")
    .map(([k]) => amenityLabel(k));

  const priceHighlights = station.prices?.length
    ? pickHighlightPrices(station.prices)
    : [];

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

        {priceHighlights.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {priceHighlights.map((p) => (
              <span
                key={`${p.fuel}-${p.isSelf}`}
                className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900"
              >
                {p.fuel} {formatFuelPrice(p.price)}
                {p.isSelf ? " self" : ""}
              </span>
            ))}
          </div>
        ) : null}

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
              {s === "google_maps"
                ? "Google"
                : s === "openstreetmap"
                  ? "OSM"
                  : s === "osservaprezzi"
                    ? "MIMIT"
                    : s}
            </span>
          ))}
          {station.openNow != null ? (
            <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--ink-muted)]">
              {station.openNow ? "Aperto ora" : "Chiuso ora"}
            </span>
          ) : null}
        </div>

        {station.notes
          .filter((n) => !n.startsWith("Prezzi MIMIT:"))
          .map((n) => (
            <p key={n} className="mt-1 text-xs text-[var(--ink)]">
              {n}
            </p>
          ))}

        {station.phone ? (
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Telefono: {station.phone}
          </p>
        ) : null}
        {station.verifyByPhone && station.amenities.adblue === "yes" ? (
          <p className="mt-1 text-[11px] text-amber-800">
            Consigliato telefonare per confermare che l’erogatore AdBlue funzioni.
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
          Maps
        </a>
        {directionsOrigin ? (
          <a
            href={mapsDirectionsUrl({
              origin: directionsOrigin,
              destination: station.location,
              destinationLabel: station.name,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--ink)]"
          >
            <Route className="h-3.5 w-3.5" />
            Indicazioni
          </a>
        ) : null}
        {station.phone ? (
          <a
            href={`tel:${station.phone.replace(/\s/g, "")}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--ink)]"
          >
            <Phone className="h-3.5 w-3.5" />
            Chiama
          </a>
        ) : null}
        {station.website ? (
          <a
            href={station.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-xs font-medium text-[var(--ink-muted)]"
          >
            Sito
          </a>
        ) : null}
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
            favorite
              ? "border-[var(--brand)] text-[var(--brand)]"
              : "border-[var(--line)] text-[var(--ink-muted)]"
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`} />
          {favorite ? "Salvato" : "Preferito"}
        </button>
      </div>
    </article>
  );
}
