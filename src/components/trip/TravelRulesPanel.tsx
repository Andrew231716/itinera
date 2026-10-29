"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { summarizeTravelRules } from "@/lib/routing/travel-rules";
import { DEFAULT_ROAD_PREFERENCES } from "@/lib/types/trip";
import {
  Button,
  Input,
  Label,
  SectionTitle,
  ToggleRow,
  cn,
} from "@/components/ui/primitives";
import { PanelResetButton } from "@/components/ui/PanelResetButton";

/**
 * Simple trip rules: a few clear switches. Advanced prefs stay collapsed.
 */
export function TravelRulesPanel() {
  const preferences = useTripStore((s) => s.trip.preferences);
  const exclusions = useTripStore((s) => s.trip.exclusions);
  const origin = useTripStore((s) => s.trip.origin);
  const destination = useTripStore((s) => s.trip.destination);
  const routes = useTripStore((s) => s.routes);
  const routeMode = useTripStore((s) => s.routeMode);
  const setPreferences = useTripStore((s) => s.setPreferences);
  const resetPreferences = useTripStore((s) => s.resetPreferences);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const { computeRoute } = useRouteCompute();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [computing, setComputing] = useState(false);

  const summary = summarizeTravelRules(preferences, exclusions);
  const canCompute = Boolean(origin && destination);
  const needsRefresh = canCompute && routes.length === 0;
  const prefsDirty = Object.entries(DEFAULT_ROAD_PREFERENCES).some(
    ([key, value]) =>
      preferences[key as keyof typeof preferences] !== value,
  );

  async function refreshRoute() {
    if (!canCompute || computing) return;
    setComputing(true);
    try {
      await computeRoute();
    } finally {
      setComputing(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Regole del viaggio"
        subtitle="Cosa deve restare vero fino a destinazione"
        action={
          <PanelResetButton
            disabled={!prefsDirty}
            onClick={resetPreferences}
            label="Reset"
          />
        }
      />

      <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink-muted)]">
        Attive ora:{" "}
        <span className="font-semibold text-[var(--ink)]">{summary}</span>
      </p>

      <div className="space-y-0.5">
        <ToggleRow
          label="Niente pedaggi"
          description="Evita strade a pagamento quando c’è un’alternativa."
          checked={preferences.avoidTolls}
          onChange={(avoidTolls) => setPreferences({ avoidTolls })}
        />
        <ToggleRow
          label="Niente autostrade"
          description="Preferisce strade secondarie."
          checked={preferences.avoidHighways}
          onChange={(avoidHighways) => setPreferences({ avoidHighways })}
        />
        <ToggleRow
          label="Niente traghetti"
          checked={preferences.avoidFerries}
          onChange={(avoidFerries) => setPreferences({ avoidFerries })}
        />
      </div>

      <div className="space-y-2 border-t border-[var(--line)] pt-3">
        <p className="text-[11px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
          Come preferisci arrivare
        </p>
        <div className="grid grid-cols-2 gap-2">
          <StyleChoice
            label="Più veloce"
            hint="Con traffico"
            selected={preferences.preferFastest && !preferences.preferShortest}
            onClick={() =>
              setPreferences({ preferFastest: true, preferShortest: false })
            }
          />
          <StyleChoice
            label="Più breve"
            hint="Meno km"
            selected={preferences.preferShortest}
            onClick={() =>
              setPreferences({ preferShortest: true, preferFastest: false })
            }
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-[var(--line)] pt-3">
        <p className="text-[11px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
          Luoghi da evitare
        </p>
        <button
          type="button"
          onClick={() => setActivePanel("exclusions")}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left transition hover:bg-[var(--surface-2)]"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-[var(--brand)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--ink)]">
              {exclusions.length === 0
                ? "Nessun luogo escluso"
                : exclusions.length === 1
                  ? "1 luogo escluso"
                  : `${exclusions.length} luoghi esclusi`}
            </span>
            <span className="block text-xs text-[var(--ink-muted)]">
              Città, strade o zone da non attraversare
            </span>
          </span>
          <span className="text-xs font-semibold text-[var(--brand)]">
            Gestisci
          </span>
        </button>
      </div>

      {canCompute ? (
        <Button
          type="button"
          className="w-full"
          disabled={computing || routeMode === "loading"}
          onClick={() => void refreshRoute()}
        >
          {computing || routeMode === "loading"
            ? "Calcolo…"
            : needsRefresh
              ? "Applica regole e calcola"
              : "Ricalcola con queste regole"}
        </Button>
      ) : (
        <p className="text-center text-xs text-[var(--ink-muted)]">
          Imposta partenza e destinazione, poi calcola il percorso.
        </p>
      )}

      <div className="border-t border-[var(--line)] pt-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-medium text-[var(--ink-muted)]"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          Altre opzioni
          {advancedOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {advancedOpen ? (
          <div className="space-y-1 pb-1">
            <ToggleRow
              label="Evita tunnel"
              description="Non sempre applicabile dal motore."
              checked={preferences.avoidTunnels}
              onChange={(avoidTunnels) => setPreferences({ avoidTunnels })}
              soft
            />
            <ToggleRow
              label="Strade panoramiche"
              description="Preferenza soft."
              checked={preferences.preferScenic}
              onChange={(preferScenic) => setPreferences({ preferScenic })}
              soft
            />
            <div className="pt-1">
              <Label>Minuti in più accettabili</Label>
              <Input
                type="number"
                min={0}
                max={600}
                placeholder="Nessun limite"
                value={preferences.maxExtraMinutes ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  setPreferences({
                    maxExtraMinutes:
                      raw === "" ? null : Math.max(0, Number(raw)),
                  });
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StyleChoice({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-left transition",
        selected
          ? "border-[var(--brand)] bg-[var(--brand-soft)]"
          : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
      )}
    >
      <span className="block text-sm font-semibold text-[var(--ink)]">
        {label}
      </span>
      <span className="block text-[11px] text-[var(--ink-muted)]">{hint}</span>
    </button>
  );
}
