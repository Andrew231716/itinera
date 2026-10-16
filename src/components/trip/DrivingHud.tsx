"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { formatDistance } from "@/lib/utils/format";
import { getNavTripMetrics } from "@/lib/navigation/nav-metrics";
import {
  TRAFFIC_MONITOR_INTERVAL_MS,
  type TrafficLevel,
} from "@/lib/routing/traffic-info";
import { Button } from "@/components/ui/primitives";

function trafficChipClass(level: TrafficLevel): string {
  switch (level) {
    case "fluid":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "moderate":
      return "bg-amber-500/20 text-amber-900 dark:text-amber-100";
    case "heavy":
    case "severe":
      return "bg-red-500/20 text-red-900 dark:text-red-100";
    default:
      return "bg-[var(--surface-2)] text-[var(--ink-muted)]";
  }
}

function trafficBarClass(level: TrafficLevel): string {
  switch (level) {
    case "fluid":
      return "bg-emerald-500";
    case "moderate":
      return "bg-amber-500";
    case "heavy":
      return "bg-orange-500";
    case "severe":
      return "bg-red-500";
    default:
      return "bg-[var(--line)]";
  }
}

/**
 * Google Maps–style driving chrome: maneuver + ETA / minutes / km / traffic.
 */
export function DrivingHud() {
  const navigation = useTripStore((s) => s.navigation);
  const routes = useTripStore((s) => s.routes);
  const selectedRouteId = useTripStore((s) => s.trip.selectedRouteId);
  const stopNavigation = useTripStore((s) => s.stopNavigation);
  const setNavigationVoice = useTripStore((s) => s.setNavigationVoice);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);
  const { computeRoute } = useRouteCompute();
  const computeRef = useRef(computeRoute);
  computeRef.current = computeRoute;

  const [nowMs, setNowMs] = useState(() => Date.now());
  const progress = navigation.progress;
  const next = progress?.nextManeuver;
  const selected =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  const active =
    navigation.status === "navigating" ||
    navigation.status === "off_route" ||
    navigation.status === "starting" ||
    navigation.status === "arrived";

  // Refresh ETA clock every 30s
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);

  // Quiet traffic refresh while driving
  useEffect(() => {
    if (!active || navigation.status === "arrived") return;
    const id = window.setInterval(() => {
      void computeRef.current();
    }, TRAFFIC_MONITOR_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active, navigation.status]);

  const metrics = useMemo(() => {
    if (!selected || !progress) return null;
    return getNavTripMetrics(selected, progress, nowMs);
  }, [selected, progress, nowMs]);

  if (!active) return null;

  function exitNav() {
    stopNavigation();
    setActivePanel("summary");
    setMobilePanelOpen(true);
  }

  const speedKmh =
    navigation.speedMps != null && navigation.speedMps > 0.5
      ? Math.round(navigation.speedMps * 3.6)
      : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-stretch gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {navigation.status === "off_route" ? (
        <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
          Fuori percorso
          {progress
            ? ` · ${formatDistance(progress.crossTrackMeters)} dalla linea`
            : ""}
          .
        </div>
      ) : null}

      {navigation.status === "arrived" ? (
        <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-lg dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-50">
          <p className="font-semibold">Sei arrivato</p>
          {metrics ? (
            <p className="mt-1 text-xs opacity-80">
              Arrivo {metrics.etaLabel}
            </p>
          ) : null}
          <Button type="button" className="mt-2 w-full" onClick={exitNav}>
            Chiudi navigazione
          </Button>
        </div>
      ) : (
        <div className="pointer-events-auto mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 shadow-[0_12px_40px_var(--shadow-panel)] backdrop-blur-xl">
          <div
            className={`h-1 w-full ${trafficBarClass(metrics?.level ?? "unknown")}`}
            aria-hidden
          />

          <div className="flex items-stretch">
            <div className="flex min-w-[4.75rem] flex-col items-center justify-center bg-[var(--brand)] px-3 py-3 text-white">
              <span className="font-[family-name:var(--font-display)] text-2xl leading-none font-semibold">
                {progress
                  ? formatDistance(progress.metersToNextManeuver)
                  : "…"}
              </span>
              <span className="mt-1 text-[10px] font-medium tracking-wide uppercase opacity-80">
                dopo
              </span>
            </div>
            <div className="min-w-0 flex-1 px-3 py-3">
              <p className="font-[family-name:var(--font-display)] text-lg leading-snug text-[var(--ink)]">
                {navigation.status === "starting"
                  ? "Ricerca GPS…"
                  : (next?.instruction ?? "Segui il percorso")}
              </p>
              {speedKmh != null ? (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {speedKmh} km/h
                </p>
              ) : null}
            </div>
          </div>

          {metrics ? (
            <div className="grid grid-cols-4 gap-1 border-t border-[var(--line)] px-2 py-2.5 text-center">
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg leading-none font-semibold text-[var(--ink)]">
                  {metrics.etaLabel}
                </p>
                <p className="mt-1 text-[10px] font-medium tracking-wide text-[var(--ink-muted)] uppercase">
                  Arrivo
                </p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg leading-none font-semibold text-[var(--ink)]">
                  {metrics.remainingMinutesLabel}
                </p>
                <p className="mt-1 text-[10px] font-medium tracking-wide text-[var(--ink-muted)] uppercase">
                  Tempo
                </p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg leading-none font-semibold text-[var(--ink)]">
                  {formatDistance(metrics.remainingMeters)}
                </p>
                <p className="mt-1 text-[10px] font-medium tracking-wide text-[var(--ink-muted)] uppercase">
                  Distanza
                </p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span
                  className={`inline-flex max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${trafficChipClass(metrics.level)}`}
                  title={metrics.traffic.summary}
                >
                  {metrics.delayLabel ??
                    (metrics.level === "fluid"
                      ? "Fluido"
                      : metrics.level === "unknown"
                        ? "n/d"
                        : metrics.traffic.label.replace("Traffico ", ""))}
                </span>
                <p className="mt-1 text-[10px] font-medium tracking-wide text-[var(--ink-muted)] uppercase">
                  Traffico
                </p>
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--ink-muted)]">
              In attesa posizione GPS…
            </div>
          )}

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
