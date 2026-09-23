"use client";

import { useTripStore } from "@/lib/store/trip-store";
import {
  Input,
  Label,
  SectionTitle,
  ToggleRow,
} from "@/components/ui/primitives";

export function PreferencesPanel() {
  const preferences = useTripStore((s) => s.trip.preferences);
  const setPreferences = useTripStore((s) => s.setPreferences);

  return (
    <div className="space-y-2">
      <SectionTitle
        title="Personalizza il percorso"
        subtitle="Indicazioni preferenziali per il motore di routing — non garanzie assolute"
      />

      <ToggleRow
        label="Evita pedaggi"
        checked={preferences.avoidTolls}
        onChange={(avoidTolls) => setPreferences({ avoidTolls })}
      />
      <ToggleRow
        label="Evita autostrade"
        checked={preferences.avoidHighways}
        onChange={(avoidHighways) => setPreferences({ avoidHighways })}
      />
      <ToggleRow
        label="Evita traghetti"
        checked={preferences.avoidFerries}
        onChange={(avoidFerries) => setPreferences({ avoidFerries })}
      />
      <ToggleRow
        label="Evita tunnel"
        description="Non supportato nativamente da Google Routes: resta una preferenza soft."
        checked={preferences.avoidTunnels}
        onChange={(avoidTunnels) => setPreferences({ avoidTunnels })}
        soft
      />
      <ToggleRow
        label="Preferisci il percorso più veloce"
        checked={preferences.preferFastest}
        onChange={(preferFastest) => setPreferences({ preferFastest })}
      />
      <ToggleRow
        label="Preferisci il percorso più breve"
        description="Mappato su un’indicazione preferenziale del motore, non su distanza minima garantita."
        checked={preferences.preferShortest}
        onChange={(preferShortest) => setPreferences({ preferShortest })}
        soft
      />
      <ToggleRow
        label="Preferisci strade panoramiche"
        description="Preferenza soft: non esiste un flag nativo nelle Routes API."
        checked={preferences.preferScenic}
        onChange={(preferScenic) => setPreferences({ preferScenic })}
        soft
      />

      <div className="pt-2">
        <Label>Aumento massimo del tempo di percorrenza (minuti)</Label>
        <Input
          type="number"
          min={0}
          max={600}
          placeholder="Nessun limite"
          value={preferences.maxExtraMinutes ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            setPreferences({
              maxExtraMinutes: raw === "" ? null : Math.max(0, Number(raw)),
            });
          }}
        />
        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
          Usato per filtrare le alternative dopo il calcolo, non come vincolo
          nativo del motore.
        </p>
      </div>
    </div>
  );
}
