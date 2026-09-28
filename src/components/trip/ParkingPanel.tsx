"use client";

import {
  CircleParking,
  ExternalLink,
  Heart,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import type { ParkingSearchResult, ParkingSpot } from "@/lib/parking/types";
import { parkingSpotToPlaceRef } from "@/lib/parking/place-ref";
import {
  listSavedPlaces,
  removeSavedPlace,
  saveSavedPlace,
  type SavedPlace,
} from "@/lib/storage/saved-places";
import { formatCurrency, formatDistance } from "@/lib/utils/format";
import {
  Badge,
  Button,
  EmptyHint,
  Input,
  SectionTitle,
} from "@/components/ui/primitives";

type PricingFilter = "all" | "free" | "paid" | "unknown";

export function ParkingPanel() {
  const trip = useTripStore((s) => s.trip);
  const parkingCenter = useTripStore((s) => s.parkingCenter);
  const parkingSearchNonce = useTripStore((s) => s.parkingSearchNonce);
  const parkingSpots = useTripStore((s) => s.parkingSpots);
  const selectedParkingId = useTripStore((s) => s.selectedParkingId);
  const setParkingSpots = useTripStore((s) => s.setParkingSpots);
  const selectParking = useTripStore((s) => s.selectParking);
  const applySelectedParking = useTripStore((s) => s.applySelectedParking);
  const requestParkingNear = useTripStore((s) => s.requestParkingNear);

  const [filter, setFilter] = useState<PricingFilter>("all");
  const [radius, setRadius] = useState(1200);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<SavedPlace[]>([]);

  const center = useMemo(() => {
    if (parkingCenter) {
      return { ...parkingCenter, kind: "ricerca" as const };
    }
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
      lat: 45.4642,
      lng: 9.19,
      label: "Milano (esempio)",
      kind: "esempio" as const,
    };
  }, [parkingCenter, trip.destination, trip.origin]);

  const reloadFavorites = useCallback(() => {
    setFavorites(listSavedPlaces().filter((p) => p.kind === "parking"));
  }, []);

  useEffect(() => {
    reloadFavorites();
  }, [reloadFavorites]);

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
      const res = await fetch(`/api/parking/nearby?${params.toString()}`);
      const data = (await res.json()) as ParkingSearchResult & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Ricerca parcheggi non riuscita.");
      }
      setParkingSpots(data.spots);
      setLimitations(data.limitations ?? []);
    } catch (err) {
      setParkingSpots([]);
      setError(err instanceof Error ? err.message : "Errore di ricerca.");
    } finally {
      setLoading(false);
    }
  }, [center, radius, query, setParkingSpots]);

  useEffect(() => {
    void load();
  }, [load, parkingSearchNonce]);

  function useGps() {
    if (!navigator.geolocation) {
      setError("Geolocalizzazione non disponibile su questo dispositivo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requestParkingNear({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Posizione GPS",
        });
      },
      () => setError("Impossibile ottenere la posizione GPS."),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  const spots = useMemo(() => {
    if (filter === "all") return parkingSpots;
    return parkingSpots.filter((s) => s.pricing === filter);
  }, [parkingSpots, filter]);

  const counts = useMemo(() => {
    return {
      all: parkingSpots.length,
      free: parkingSpots.filter((s) => s.pricing === "free").length,
      paid: parkingSpots.filter((s) => s.pricing === "paid").length,
      unknown: parkingSpots.filter((s) => s.pricing === "unknown").length,
    };
  }, [parkingSpots]);

  const selected = parkingSpots.find((s) => s.id === selectedParkingId) ?? null;

  function toggleFavorite(spot: ParkingSpot) {
    const existing = favorites.find(
      (f) =>
        Math.abs(f.place.location.lat - spot.location.lat) < 1e-5 &&
        Math.abs(f.place.location.lng - spot.location.lng) < 1e-5,
    );
    if (existing) {
      removeSavedPlace(existing.id);
    } else {
      saveSavedPlace({
        kind: "parking",
        label: spot.name,
        note: spot.cost?.summary,
        place: parkingSpotToPlaceRef(spot),
      });
    }
    reloadFavorites();
  }

  function isFavorite(spot: ParkingSpot): boolean {
    return favorites.some(
      (f) =>
        Math.abs(f.place.location.lat - spot.location.lat) < 1e-5 &&
        Math.abs(f.place.location.lng - spot.location.lng) < 1e-5,
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Parcheggi"
        subtitle="Gratuiti e a pagamento · OSM, Google Maps, EasyPark (ricerca gratuita)"
      />

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
        Centro:{" "}
        <span className="font-medium text-[var(--ink)]">{center.label}</span>
        <span className="text-[var(--ink-faint)]"> · {center.kind}</span>
        <p className="mt-1">
          Clicca un marker P sulla mappa o una card qui sotto per selezionare la
          zona. Poi usala come destinazione o tappa.
        </p>
      </div>

      {trip.destination ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            requestParkingNear({
              lat: trip.destination!.location.lat,
              lng: trip.destination!.location.lng,
              label: trip.destination!.label,
            })
          }
        >
          <CircleParking className="h-3.5 w-3.5" />
          Parcheggi vicino a «{trip.destination.label}»
        </Button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={useGps}>
          <Navigation className="h-3.5 w-3.5" />
          Usa GPS
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
            placeholder="Filtra testo (es. garage, EasyPark)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </div>
        <select
          className="h-10 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)]"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          aria-label="Raggio di ricerca"
        >
          <option value={600}>600 m</option>
          <option value={1200}>1,2 km</option>
          <option value={2000}>2 km</option>
          <option value={3500}>3,5 km</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", `Tutti (${counts.all})`],
            ["free", `Gratuiti (${counts.free})`],
            ["paid", `A pagamento (${counts.paid})`],
            ["unknown", `Senza tariffa (${counts.unknown})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
              filter === id
                ? "bg-[var(--brand)] text-white"
                : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="space-y-2 rounded-xl border border-[var(--brand)]/40 bg-[var(--brand-soft)]/40 p-3">
          <p className="text-xs font-semibold text-[var(--ink)]">
            Selezionato: {selected.name}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => applySelectedParking("destination")}
            >
              Usa come destinazione
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => applySelectedParking("stop")}
            >
              Aggiungi come tappa
            </Button>
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
            Parcheggi preferiti
          </p>
          {favorites.map((fav) => (
            <button
              key={fav.id}
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              onClick={() =>
                requestParkingNear({
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

      {loading && parkingSpots.length === 0 ? (
        <EmptyHint>Ricerca parcheggi in corso…</EmptyHint>
      ) : null}

      {!loading && spots.length === 0 ? (
        <EmptyHint>
          Nessun parcheggio trovato. Imposta una destinazione o usa il GPS.
        </EmptyHint>
      ) : null}

      <div className="space-y-2">
        {spots.map((spot) => (
          <ParkingCard
            key={spot.id}
            spot={spot}
            selected={spot.id === selectedParkingId}
            favorite={isFavorite(spot)}
            onSelect={() => selectParking(spot.id)}
            onToggleFavorite={() => toggleFavorite(spot)}
          />
        ))}
      </div>

      {limitations.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          <p className="font-semibold">Note sulle fonti</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ParkingCard({
  spot,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  spot: ParkingSpot;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const tone =
    spot.pricing === "free"
      ? "ok"
      : spot.pricing === "paid"
        ? "warn"
        : "neutral";

  return (
    <article
      className={`rounded-xl border px-3 py-3 transition ${
        selected
          ? "border-[var(--brand)] bg-[var(--brand-soft)]/30 ring-1 ring-[var(--brand)]/30"
          : "border-[var(--line)] bg-[var(--surface)]"
      }`}
    >
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <CircleParking className="h-4 w-4 shrink-0 text-[var(--brand)]" />
              <h3 className="truncate text-sm font-semibold text-[var(--ink)]">
                {spot.name}
              </h3>
            </div>
            {spot.address ? (
              <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                {spot.address}
              </p>
            ) : null}
          </div>
          <Badge tone={tone}>
            {spot.pricing === "free"
              ? "Gratuito"
              : spot.pricing === "paid"
                ? "A pagamento"
                : "Tariffa ?"}
          </Badge>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--ink-muted)]">
            {formatDistance(spot.distanceMeters)}
          </span>
          {spot.sources.map((s) => (
            <span
              key={s}
              className="rounded-md bg-[var(--brand-soft)] px-1.5 py-0.5 text-[var(--brand)]"
            >
              {sourceLabel(s)}
            </span>
          ))}
        </div>

        {spot.cost ? (
          <p className="mt-2 text-xs text-[var(--ink)]">
            <span className="font-medium">Costi: </span>
            {spot.cost.summary}
            {spot.cost.hourlyEstimate != null
              ? ` · ~${formatCurrency(spot.cost.hourlyEstimate)}/ora`
              : null}
          </p>
        ) : null}
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={spot.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-3)]"
        >
          <MapPin className="h-3.5 w-3.5" />
          Maps
        </a>
        {spot.easyPark?.available ? (
          <a
            href={spot.easyPark.searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 text-xs font-medium text-white hover:brightness-105"
          >
            <Search className="h-3.5 w-3.5" />
            Cerca EasyPark
          </a>
        ) : null}
        {spot.easyPark?.feesDocumentUrl || spot.cost?.documentUrl ? (
          <a
            href={spot.cost?.documentUrl ?? spot.easyPark!.feesDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-xs font-medium text-[var(--ink-muted)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Tariffe
          </a>
        ) : null}
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-medium ${
            favorite
              ? "bg-rose-100 text-rose-700"
              : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`} />
          {favorite ? "Salvato" : "Preferito"}
        </button>
      </div>
    </article>
  );
}

function sourceLabel(source: ParkingSpot["sources"][number]): string {
  switch (source) {
    case "google_maps":
      return "Google Maps";
    case "openstreetmap":
      return "OSM";
    case "easypark":
      return "EasyPark";
    case "official":
      return "Ufficiale";
  }
}
