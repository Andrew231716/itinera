"use client";

import { ArrowDownUp, CalendarClock, Car, CircleParking } from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import type { TravelMode } from "@/lib/types/trip";
import {
  formatDateTimeLocal,
  localInputToIso,
} from "@/lib/utils/format";
import { Button, Input, Label, SectionTitle } from "@/components/ui/primitives";
import { PlaceSearch, MapPickHint } from "@/components/trip/PlaceSearch";
import { StopList } from "@/components/trip/StopList";

const MODES: Array<{ value: TravelMode; label: string }> = [
  { value: "DRIVE", label: "Auto" },
  { value: "TWO_WHEELER", label: "Moto" },
  { value: "TRANSIT", label: "Mezzi" },
  { value: "BICYCLE", label: "Bici" },
  { value: "WALK", label: "A piedi" },
];

export function TripForm() {
  const trip = useTripStore((s) => s.trip);
  const setTitle = useTripStore((s) => s.setTitle);
  const setOrigin = useTripStore((s) => s.setOrigin);
  const setDestination = useTripStore((s) => s.setDestination);
  const swapOriginDestination = useTripStore((s) => s.swapOriginDestination);
  const setDepartureAt = useTripStore((s) => s.setDepartureAt);
  const setTravelMode = useTripStore((s) => s.setTravelMode);
  const mapPickTarget = useTripStore((s) => s.mapPickTarget);
  const setMapPickTarget = useTripStore((s) => s.setMapPickTarget);
  const requestParkingNear = useTripStore((s) => s.requestParkingNear);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Itinerario"
        subtitle="Partenza, tappe e destinazione"
      />

      <div>
        <Label>Titolo viaggio</Label>
        <Input
          value={trip.meta.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Es. Weekend Toscana"
        />
      </div>

      <PlaceSearch
        label="Partenza"
        value={trip.origin}
        onSelect={setOrigin}
        onClear={() => setOrigin(null)}
        onPickFromMap={() => setMapPickTarget("origin")}
        pickingFromMap={mapPickTarget === "origin"}
      />

      <div className="flex justify-center">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={swapOriginDestination}
          aria-label="Inverti origine e destinazione"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          Inverti
        </Button>
      </div>

      <PlaceSearch
        label="Destinazione"
        value={trip.destination}
        onSelect={(place) => {
          setDestination(place);
          // After choosing destination, offer parking search for that area.
          if (place) {
            setActivePanel("parking");
            setMobilePanelOpen(true);
          }
        }}
        onClear={() => setDestination(null)}
        onPickFromMap={() => setMapPickTarget("destination")}
        pickingFromMap={mapPickTarget === "destination"}
      />

      {trip.destination ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() =>
            requestParkingNear({
              lat: trip.destination!.location.lat,
              lng: trip.destination!.location.lng,
              label: trip.destination!.label,
            })
          }
        >
          <CircleParking className="h-3.5 w-3.5" />
          Cerca parcheggi vicino a «{trip.destination.label}»
        </Button>
      ) : null}

      <MapPickHint
        active={
          mapPickTarget === "origin" ||
          mapPickTarget === "destination" ||
          mapPickTarget === "stop"
        }
        onCancel={() => setMapPickTarget(null)}
      />

      <div>
        <SectionTitle title="Tappe" subtitle="Illimitate nei limiti API" />
        <StopList />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" /> Data e ora partenza
            </span>
          </Label>
          <Input
            type="datetime-local"
            value={formatDateTimeLocal(trip.departureAt)}
            onChange={(e) => setDepartureAt(localInputToIso(e.target.value))}
          />
        </div>
        <div>
          <Label>
            <span className="inline-flex items-center gap-1">
              <Car className="h-3 w-3" /> Mezzo
            </span>
          </Label>
          <select
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            value={trip.travelMode}
            onChange={(e) => setTravelMode(e.target.value as TravelMode)}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
