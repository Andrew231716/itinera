"use client";

import { useTripStore } from "@/lib/store/trip-store";
import { describePreferenceStatuses } from "@/lib/routing/preference-mapper";
import {
  Badge,
  Input,
  Label,
  SectionTitle,
  ToggleRow,
} from "@/components/ui/primitives";

const STATUS_TONE: Record<
  string,
  "neutral" | "brand" | "warn" | "demo" | "ok"
> = {
  engine_direct: "ok",
  preferential: "brand",
  post_verified: "ok",
  unsupported: "warn",
  unverifiable: "demo",
};

const STATUS_LABEL: Record<string, string> = {
  engine_direct: "Motore",
  preferential: "Preferenziale",
  post_verified: "Post-verifica",
  unsupported: "Non supportata",
  unverifiable: "Non verificabile",
};

export function PreferencesPanel() {
  const preferences = useTripStore((s) => s.trip.preferences);
  const setPreferences = useTripStore((s) => s.setPreferences);
  const statuses = describePreferenceStatuses(preferences);

  return (
    <div className="space-y-2">
      <SectionTitle
        title="Personalizza il percorso"
        subtitle="Soft vs indicazioni motore — non garanzie assolute"
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
        description="Non supportato nativamente da Google Routes."
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
        description="Indicazione preferenziale (fuel-efficient), non distanza minima garantita."
        checked={preferences.preferShortest}
        onChange={(preferShortest) => setPreferences({ preferShortest })}
        soft
      />
      <ToggleRow
        label="Preferisci strade panoramiche"
        description="Preferenza soft non applicabile automaticamente."
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
      </div>

      <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Stato applicazione
        </p>
        {statuses.map((s) => (
          <div
            key={s.key}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-[var(--ink)]">
                {s.label}
              </span>
              <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>
                {STATUS_LABEL[s.status] ?? s.status}
              </Badge>
              {s.enabled ? (
                <Badge tone="brand">attiva</Badge>
              ) : (
                <Badge>off</Badge>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-muted)]">
              {s.explanation}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
