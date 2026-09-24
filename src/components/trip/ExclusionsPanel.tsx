"use client";

import { nanoid } from "nanoid";
import { MapPinned, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import type { CustomExclusion, PointExclusion } from "@/lib/types/trip";
import {
  Badge,
  Button,
  EmptyHint,
  Input,
  Label,
  SectionTitle,
} from "@/components/ui/primitives";
import { PlaceSearch, MapPickHint } from "@/components/trip/PlaceSearch";
import { createPointExclusion } from "@/lib/routing/exclusion-helpers";

function exclusionKindLabel(kind: CustomExclusion["kind"]): string {
  switch (kind) {
    case "city":
      return "Città";
    case "address":
      return "Indirizzo";
    case "road":
      return "Strada";
    case "road_segment":
      return "Tratto";
    case "geo_zone":
      return "Zona";
  }
}

export function ExclusionsPanel() {
  const exclusions = useTripStore((s) => s.trip.exclusions);
  const addExclusion = useTripStore((s) => s.addExclusion);
  const updateExclusion = useTripStore((s) => s.updateExclusion);
  const removeExclusion = useTripStore((s) => s.removeExclusion);
  const mapPickTarget = useTripStore((s) => s.mapPickTarget);
  const setMapPickTarget = useTripStore((s) => s.setMapPickTarget);
  const exclusionDraftPoints = useTripStore((s) => s.exclusionDraftPoints);
  const clearExclusionDraft = useTripStore((s) => s.clearExclusionDraft);
  const finalizeGeoZone = useTripStore((s) => s.finalizeGeoZone);

  const [kind, setKind] = useState<"city" | "address" | "road">("city");
  const [zoneLabel, setZoneLabel] = useState("Zona da evitare");

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Strade e zone da evitare"
        subtitle="Vincoli obbligatori (hard) separati dalle semplici preferenze"
      />

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-3">
        <Label>Aggiungi esclusione da ricerca</Label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["city", "Città"],
              ["address", "Indirizzo"],
              ["road", "Strada"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                kind === value
                  ? "bg-[var(--brand)] text-white"
                  : "bg-[var(--surface)] text-[var(--ink-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <PlaceSearch
          label="Località da escludere"
          value={null}
          onSelect={(place) => {
            addExclusion(
              createPointExclusion({
                id: nanoid(),
                kind,
                label: place.label,
                place,
              }),
            );
          }}
        />
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-3">
        <Label>Esclusioni dalla mappa</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mapPickTarget === "exclusion_point" ? "primary" : "outline"}
            onClick={() =>
              setMapPickTarget(
                mapPickTarget === "exclusion_point" ? null : "exclusion_point",
              )
            }
          >
            <MapPinned className="h-3.5 w-3.5" />
            Punto / indirizzo
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mapPickTarget === "exclusion_zone" ? "primary" : "outline"}
            onClick={() =>
              setMapPickTarget(
                mapPickTarget === "exclusion_zone" ? null : "exclusion_zone",
              )
            }
          >
            Disegna zona
          </Button>
        </div>
        <MapPickHint
          active={
            mapPickTarget === "exclusion_point" ||
            mapPickTarget === "exclusion_zone"
          }
          onCancel={() => {
            setMapPickTarget(null);
            clearExclusionDraft();
          }}
        />
        {mapPickTarget === "exclusion_zone" ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--ink-muted)]">
              Tocca almeno 3 punti sulla mappa per chiudere un poligono.
              Punti: {exclusionDraftPoints.length}
            </p>
            <Input
              value={zoneLabel}
              onChange={(e) => setZoneLabel(e.target.value)}
              placeholder="Nome zona"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={exclusionDraftPoints.length < 3}
                onClick={() => finalizeGeoZone(zoneLabel)}
              >
                Conferma zona
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearExclusionDraft}
              >
                Reset punti
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {exclusions.length === 0 ? (
          <EmptyHint>
            Nessuna esclusione. Le zone hard vengono verificate sul percorso
            calcolato; se non c’è alternativa valida, lo segnaleremo.
          </EmptyHint>
        ) : (
          exclusions.map((ex) => (
            <div
              key={ex.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {ex.label}
                    </p>
                    <Badge>{exclusionKindLabel(ex.kind)}</Badge>
                    <Badge tone={ex.strength === "hard" ? "warn" : "neutral"}>
                      {ex.strength}
                    </Badge>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Elimina esclusione"
                  className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeExclusion(ex.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                  Forza
                  <select
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
                    value={ex.strength}
                    onChange={(e) =>
                      updateExclusion(ex.id, {
                        strength: e.target.value as "hard" | "soft",
                      })
                    }
                  >
                    <option value="hard">hard</option>
                    <option value="soft">soft</option>
                  </select>
                </label>
                {ex.kind === "city" ||
                ex.kind === "address" ||
                ex.kind === "road" ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                    Raggio (m)
                    <input
                      type="number"
                      min={50}
                      max={50000}
                      className="w-24 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
                      value={ex.radiusMeters}
                      onChange={(e) =>
                        updateExclusion(ex.id, {
                          radiusMeters: Math.max(50, Number(e.target.value) || 50),
                        } as Partial<PointExclusion>)
                      }
                    />
                  </label>
                ) : null}
                {ex.kind === "road_segment" ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                    Buffer (m)
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      className="w-24 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
                      value={ex.bufferMeters}
                      onChange={(e) =>
                        updateExclusion(ex.id, {
                          bufferMeters: Math.max(10, Number(e.target.value) || 10),
                        })
                      }
                    />
                  </label>
                ) : null}
                {ex.kind === "geo_zone" ? (
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    Poligono · {ex.polygon.length} punti
                  </p>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
