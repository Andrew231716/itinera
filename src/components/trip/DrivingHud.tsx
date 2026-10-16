"use client";

import { Volume2, VolumeX, X } from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import { formatDistance, formatDuration } from "@/lib/utils/format";
import { Button } from "@/components/ui/primitives";

/**
 * Compact Google Maps–style driving chrome: next maneuver + exit.
 * GPS/wake-lock live in AppShell via useNavigation.
 */
export function DrivingHud() {
  const navigation = useTripStore((s) => s.navigation);
  const stopNavigation = useTripStore((s) => s.stopNavigation);
  const setNavigationVoice = useTripStore((s) => s.setNavigationVoice);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);

  const progress = navigation.progress;
  const next = progress?.nextManeuver;
  const active =
    navigation.status === "navigating" ||
    navigation.status === "off_route" ||
    navigation.status === "starting" ||
    navigation.status === "arrived";

  if (!active) return null;

  function exitNav() {
    stopNavigation();
    setActivePanel("summary");
    setMobilePanelOpen(true);
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-stretch gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {navigation.status === "off_route" ? (
        <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-lg">
          Fuori percorso
          {progress
            ? ` · ${formatDistance(progress.crossTrackMeters)} dalla linea`
            : ""}
          .
        </div>
      ) : null}

      {navigation.status === "arrived" ? (
        <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-lg">
          <p className="font-semibold">Sei arrivato</p>
          <Button type="button" className="mt-2 w-full" onClick={exitNav}>
            Chiudi navigazione
          </Button>
        </div>
      ) : (
        <div className="pointer-events-auto mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 shadow-[0_12px_40px_rgba(36,52,71,0.22)] backdrop-blur-xl">
          <div className="flex items-stretch">
            <div className="flex min-w-[4.5rem] flex-col items-center justify-center bg-[var(--brand)] px-3 py-3 text-white">
              <span className="font-[family-name:var(--font-display)] text-2xl leading-none font-semibold">
                {progress
                  ? formatDistance(progress.metersToNextManeuver)
                  : "…"}
              </span>
              <span className="mt-1 text-[10px] font-medium tracking-wide uppercase opacity-80">
                poi
              </span>
            </div>
            <div className="min-w-0 flex-1 px-3 py-3">
              <p className="font-[family-name:var(--font-display)] text-lg leading-snug text-[var(--ink)]">
                {navigation.status === "starting"
                  ? "Ricerca GPS…"
                  : (next?.instruction ?? "Segui il percorso")}
              </p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                {progress
                  ? `${formatDistance(progress.remainingMeters)} · ${formatDuration(progress.remainingSeconds)}`
                  : "In attesa posizione"}
                {navigation.speedMps != null && navigation.speedMps > 0.5
                  ? ` · ${Math.round(navigation.speedMps * 3.6)} km/h`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--line)] px-2 py-2">
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="flex-1"
              onClick={exitNav}
            >
              <X className="h-3.5 w-3.5" />
              Esci
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setNavigationVoice(!navigation.voiceEnabled)}
              aria-label={
                navigation.voiceEnabled ? "Disattiva voce" : "Attiva voce"
              }
            >
              {navigation.voiceEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
