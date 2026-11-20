"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useTripStore } from "@/lib/store/trip-store";
import { profileSchema } from "@/lib/storage/backup";
import { Button, Input, Label } from "@/components/ui/primitives";
import { formatDateTimeLocal, localInputToIso } from "@/lib/utils/format";

type Profile = z.infer<typeof profileSchema>;
const KEY = "itinera.profiles.v1";
export function TravelOptions() {
  const trip = useTripStore((s) => s.trip);
  const setPlanning = useTripStore((s) => s.setPlanning);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const reload = () => {
      try {
        setProfiles(
          z
            .array(profileSchema)
            .parse(JSON.parse(localStorage.getItem(KEY) ?? "[]")),
        );
      } catch {
        setMessage("Profili non disponibili.");
      }
    };
    reload();
    window.addEventListener("itinera-library-changed", reload);
    return () => window.removeEventListener("itinera-library-changed", reload);
  }, []);
  const motor =
    trip.travelMode === "DRIVE" || trip.travelMode === "TWO_WHEELER";
  return (
    <details className="workspace-card">
      <summary className="cursor-pointer font-semibold">
        Arrivo, costi e profili
      </summary>
      <div className="mt-4 space-y-4">
        <div>
          <Label>Vorrei arrivare entro</Label>
          <Input
            aria-label="Arrivo desiderato"
            type="datetime-local"
            value={formatDateTimeLocal(trip.arrivalBy ?? null)}
            onChange={(event) =>
              setPlanning({ arrivalBy: localInputToIso(event.target.value) })
            }
          />
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Dopo il calcolo vedrai quando partire, includendo le soste
            impostate.
          </p>
        </div>
        {motor && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Consumo l/100 km</Label>
              <Input
                aria-label="Consumo litri ogni 100 km"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={trip.costs?.consumptionLitersPer100Km ?? ""}
                onChange={(event) =>
                  setPlanning({
                    costs: {
                      consumptionLitersPer100Km: Math.min(
                        100,
                        Math.max(0, Number(event.target.value)),
                      ),
                      fuelPricePerLiter: trip.costs?.fuelPricePerLiter ?? 0,
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>Carburante €/litro</Label>
              <Input
                aria-label="Prezzo carburante euro al litro"
                type="number"
                min="0"
                max="20"
                step="0.001"
                value={trip.costs?.fuelPricePerLiter ?? ""}
                onChange={(event) =>
                  setPlanning({
                    costs: {
                      fuelPricePerLiter: Math.min(
                        20,
                        Math.max(0, Number(event.target.value)),
                      ),
                      consumptionLitersPer100Km:
                        trip.costs?.consumptionLitersPer100Km ?? 0,
                    },
                  })
                }
              />
            </div>
          </div>
        )}
        <div className="border-t border-[var(--line)] pt-3">
          <Label>Profilo di viaggio</Label>
          <p className="mb-2 text-xs text-[var(--ink-muted)]">
            Salva mezzo, regole, esclusioni e consumi per riutilizzarli.
          </p>
          <select
            aria-label="Applica profilo di viaggio"
            value=""
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3"
            onChange={(event) => {
              const profile = profiles.find(
                (item) => item.id === event.target.value,
              );
              if (!profile) return;
              useTripStore.setState((state) => ({
                trip: {
                  ...state.trip,
                  travelMode: profile.travelMode,
                  preferences: structuredClone(profile.preferences),
                  exclusions: structuredClone(profile.exclusions),
                  costs: profile.costs,
                },
              }));
              setMessage(
                `Profilo ${profile.name} applicato. Puoi annullare dalla barra.`,
              );
            }}
          >
            <option value="">Scegli un profilo…</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              aria-label="Nome profilo"
              placeholder="Es. Auto senza pedaggi"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={!name.trim()}
              onClick={() => {
                const existing = profiles.find(
                  (profile) =>
                    profile.name.toLocaleLowerCase() ===
                    name.trim().toLocaleLowerCase(),
                );
                const profile: Profile = {
                  id: existing?.id ?? crypto.randomUUID(),
                  name: name.trim(),
                  updatedAt: new Date().toISOString(),
                  travelMode: trip.travelMode,
                  preferences: trip.preferences,
                  exclusions: trip.exclusions,
                  costs: trip.costs,
                };
                const next = [
                  profile,
                  ...profiles.filter((item) => item.id !== profile.id),
                ].slice(0, 100);
                try {
                  localStorage.setItem(KEY, JSON.stringify(next));
                  setProfiles(next);
                  setName("");
                  setMessage("Profilo salvato.");
                } catch {
                  setMessage("Spazio insufficiente per salvare il profilo.");
                }
              }}
            >
              Salva profilo
            </Button>
          </div>
        </div>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </details>
  );
}
