"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Crosshair,
  Loader2,
  Map as MapIcon,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { useNavRecalculate } from "@/hooks/useNavRecalculate";
import { formatDistance } from "@/lib/utils/format";
import { getNavTripMetrics } from "@/lib/navigation/nav-metrics";
import {
  classifyManeuver,
  extractRoadHint,
  maneuverIcon,
} from "@/lib/navigation/maneuver-icons";
import { alertKindLabel } from "@/lib/navigation/alerts";
import {
  TRAFFIC_MONITOR_INTERVAL_MS,
  type TrafficLevel,
} from "@/lib/routing/traffic-info";
import { Button, cn } from "@/components/ui/primitives";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** Auto-reroute after sustained off-route (ms) */
const AUTO_REROUTE_AFTER_MS = 12_000;
/** Minimum cross-track before auto / strong CTA */
const AUTO_REROUTE_MIN_XT_M = 120;

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
 * Google Maps–style driving chrome: maneuver, ETA, recenter, reroute.
 */
export function DrivingHud() {
  const navigation = useTripStore((s) => s.navigation);
  const routes = useTripStore((s) => s.routes);
  const selectedRouteId = useTripStore((s) => s.trip.selectedRouteId);
  const stopNavigation = useTripStore((s) => s.stopNavigation);
  const setNavigationVoice = useTripStore((s) => s.setNavigationVoice);
  const setNavigationNorthUp = useTripStore((s) => s.setNavigationNorthUp);
  const setNavigationOverview = useTripStore((s) => s.setNavigationOverview);
  const setNavigationHudSide = useTripStore((s) => s.setNavigationHudSide);
  const recenterNavigation = useTripStore((s) => s.recenterNavigation);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);
  const { computeRoute } = useRouteCompute();
  const { recalculateFromHere, error: recalcError, busy: recalcBusy } =
    useNavRecalculate();
  const computeRef = useRef(computeRoute);
  computeRef.current = computeRoute;
  const recalcRef = useRef(recalculateFromHere);
  recalcRef.current = recalculateFromHere;
  const offRouteSinceRef = useRef<number | null>(null);
  const autoRerouteDoneRef = useRef(false);

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

  const kind = classifyManeuver(next?.instruction);
  const ManeuverIcon = maneuverIcon(kind);
  const roadHint = extractRoadHint(next?.instruction);
  const offRoute = navigation.status === "off_route";
  const xt = progress?.crossTrackMeters ?? 0;
  const needsReroute = offRoute && xt >= AUTO_REROUTE_MIN_XT_M;
  const poorGps =
    navigation.accuracyMeters != null && navigation.accuracyMeters > 45;

  // Refresh ETA clock every 30s
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);

  // Quiet traffic refresh while driving (skip while recalculating)
  useEffect(() => {
    if (!active || navigation.status === "arrived" || recalcBusy) return;
    const id = window.setInterval(() => {
      void computeRef.current();
    }, TRAFFIC_MONITOR_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active, navigation.status, recalcBusy]);

  // Auto-reroute after sustained off-route
  useEffect(() => {
    if (!needsReroute || recalcBusy) {
      if (!offRoute) {
        offRouteSinceRef.current = null;
        autoRerouteDoneRef.current = false;
      }
      return;
    }
    if (offRouteSinceRef.current == null) {
      offRouteSinceRef.current = Date.now();
    }
    const id = window.setInterval(() => {
      const since = offRouteSinceRef.current;
      if (
        since != null &&
        !autoRerouteDoneRef.current &&
        Date.now() - since >= AUTO_REROUTE_AFTER_MS
      ) {
        autoRerouteDoneRef.current = true;
        void recalcRef.current();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [needsReroute, offRoute, recalcBusy]);

  const metrics = useMemo(() => {
    if (!selected || !progress) return null;
    return getNavTripMetrics(selected, progress, nowMs);
  }, [selected, progress, nowMs]);

  const landscape = useMediaQuery(
    "(orientation: landscape) and (max-height: 520px)",
  );

  if (!active) return null;

  function exitNav() {
    stopNavigation();
    setActivePanel("summary");
    setMobilePanelOpen(true);
  }

  const speedKmh =
    navigation.speedMps != null && Number.isFinite(navigation.speedMps)
      ? Math.max(0, Math.round(navigation.speedMps * 3.6))
      : null;
  const speedLimitKmh = navigation.alerts?.speedLimitKmh ?? null;
  const overLimit =
    speedKmh != null &&
    speedLimitKmh != null &&
    speedKmh > speedLimitKmh + 2;
  const nextAlert = navigation.alerts?.nextAlert ?? null;
  const metersToAlert = navigation.alerts?.metersToNextAlert ?? null;

  const hudLeft = landscape && navigation.hudSide === "left";

  return (
    <>
      {/* Floating map controls — opposite side of the HUD in landscape */}
      <div
        className={cn(
          "pointer-events-none absolute z-40 flex flex-col gap-2",
          landscape
            ? cn(
                "top-[max(0.5rem,env(safe-area-inset-top))]",
                hudLeft
                  ? "left-[min(22rem,42vw)]"
                  : "right-[min(22rem,42vw)]",
              )
            : "top-[max(4.5rem,env(safe-area-inset-top))] right-3",
        )}
      >
        {!navigation.followMap || navigation.overview ? (
          <button
            type="button"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)]/95 text-[var(--ink)] shadow-lg backdrop-blur-md"
            aria-label="Riposiziona GPS"
            title="Riposiziona"
            onClick={() => recenterNavigation()}
          >
            <Crosshair className="h-5 w-5" />
          </button>
        ) : null}
        <button
          type="button"
          className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-md ${
            navigation.northUp
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-[var(--line)] bg-[var(--surface)]/95 text-[var(--ink)]"
          }`}
          aria-label={
            navigation.northUp ? "Modalità direzione di marcia" : "Nord in alto"
          }
          title={navigation.northUp ? "Heading-up" : "Nord in alto"}
          onClick={() => setNavigationNorthUp(!navigation.northUp)}
        >
          <Compass className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-md ${
            navigation.overview
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-[var(--line)] bg-[var(--surface)]/95 text-[var(--ink)]"
          }`}
          aria-label="Panoramica percorso"
          title="Panoramica"
          onClick={() => setNavigationOverview(!navigation.overview)}
        >
          <MapIcon className="h-5 w-5" />
        </button>
        {landscape ? (
          <button
            type="button"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)]/95 text-[var(--ink)] shadow-lg backdrop-blur-md"
            aria-label={
              hudLeft ? "Sposta pannello a destra" : "Sposta pannello a sinistra"
            }
            title={hudLeft ? "Pannello a destra" : "Pannello a sinistra"}
            onClick={() =>
              setNavigationHudSide(hudLeft ? "right" : "left")
            }
          >
            {hudLeft ? (
              <PanelRight className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)]/95 text-[var(--ink)] shadow-lg backdrop-blur-md disabled:opacity-50"
          aria-label="Ricalcola percorso"
          title="Ricalcola da qui"
          disabled={recalcBusy || !navigation.position}
          onClick={() => void recalculateFromHere()}
        >
          {recalcBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Speed + posted limit — away from the HUD dock */}
      {speedKmh != null || speedLimitKmh != null ? (
        <div
          className={cn(
            "pointer-events-none absolute z-40 flex items-end gap-2",
            landscape
              ? cn(
                  "top-[max(0.5rem,env(safe-area-inset-top))]",
                  hudLeft ? "right-3" : "left-3",
                )
              : "bottom-[max(14rem,env(safe-area-inset-bottom))] left-3",
          )}
        >
          {speedKmh != null ? (
            <div
              className={cn(
                "rounded-2xl border px-3 py-2 text-center shadow-lg backdrop-blur-md",
                overLimit
                  ? "border-red-500 bg-red-600 text-white"
                  : "border-[var(--line)] bg-[var(--surface)]/95 text-[var(--ink)]",
              )}
            >
              <p className="font-[family-name:var(--font-display)] text-2xl leading-none font-semibold">
                {speedKmh}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[10px] font-medium tracking-wide uppercase",
                  overLimit ? "text-white/80" : "text-[var(--ink-muted)]",
                )}
              >
                km/h
              </p>
            </div>
          ) : null}
          {speedLimitKmh != null ? (
            <div
              className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-[3px] border-red-600 bg-white shadow-lg"
              title={`Limite ${speedLimitKmh} km/h`}
              aria-label={`Limite di velocità ${speedLimitKmh} chilometri orari`}
            >
              <p className="font-[family-name:var(--font-display)] text-xl leading-none font-bold text-black">
                {speedLimitKmh}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute z-40 flex flex-col items-stretch gap-2 p-3",
          landscape
            ? cn(
                "top-0 bottom-0 w-[min(22rem,42vw)] justify-end pb-[max(0.5rem,env(safe-area-inset-bottom))]",
                hudLeft
                  ? "left-0 pl-[max(0.5rem,env(safe-area-inset-left))]"
                  : "right-0 pr-[max(0.5rem,env(safe-area-inset-right))]",
              )
            : "inset-x-0 bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
      >
        {nextAlert && metersToAlert != null && metersToAlert < 900 ? (
          <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950 shadow-lg dark:border-rose-800 dark:bg-rose-950 dark:text-rose-50">
            <p className="font-semibold">
              {alertKindLabel(nextAlert.kind)}
              {nextAlert.maxspeedKmh != null
                ? ` · limite ${nextAlert.maxspeedKmh}`
                : ""}
            </p>
            <p className="mt-0.5 text-xs opacity-90">
              tra {formatDistance(metersToAlert)}
              {nextAlert.label && nextAlert.label !== alertKindLabel(nextAlert.kind)
                ? ` · ${nextAlert.label}`
                : ""}
            </p>
          </div>
        ) : null}

        {poorGps && !offRoute ? (
          <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950 shadow-lg dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50">
            Segnale GPS debole
            {navigation.accuracyMeters != null
              ? ` (±${Math.round(navigation.accuracyMeters)} m)`
              : ""}
            . La freccia può spostarsi.
          </div>
        ) : null}

        {offRoute ? (
          <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {recalcBusy ? "Ricalcolo in corso…" : "Fuori percorso"}
                </p>
                <p className="mt-0.5 text-xs opacity-90">
                  {progress
                    ? `${formatDistance(progress.crossTrackMeters)} dalla linea`
                    : "Posizione lontana dal percorso"}
                  {needsReroute && !recalcBusy
                    ? " · ricalcolo automatico a breve"
                    : ""}
                </p>
                {recalcError ? (
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    {recalcError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={recalcBusy || !navigation.position}
                onClick={() => void recalculateFromHere()}
              >
                {recalcBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Ricalcola
              </Button>
            </div>
          </div>
        ) : null}

        {progress?.atIntermediateStop && progress.nextWaypointLabel ? (
          <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 shadow-lg dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-50">
            <p className="font-semibold">
              Tappa raggiunta: {progress.nextWaypointLabel}
            </p>
            <p className="mt-0.5 text-xs opacity-90">
              Continua verso la prossima tappa o la destinazione.
            </p>
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
          <div
            className={cn(
              "pointer-events-auto w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 shadow-[0_12px_40px_var(--shadow-panel)] backdrop-blur-xl",
              landscape ? "max-h-[calc(100dvh-1rem)] overflow-y-auto" : "mx-auto max-w-lg",
            )}
          >
            <div
              className={`h-1 w-full ${trafficBarClass(metrics?.level ?? "unknown")}`}
              aria-hidden
            />

            <div className={cn("flex items-stretch", landscape && "flex-col")}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 bg-[var(--brand)] px-2.5 py-3 text-white",
                  landscape
                    ? "min-h-0 flex-row gap-3 py-2"
                    : "min-w-[5.25rem]",
                )}
              >
                <ManeuverIcon className="h-7 w-7 shrink-0" strokeWidth={2.25} />
                <span className="font-[family-name:var(--font-display)] text-xl leading-none font-semibold">
                  {progress
                    ? formatDistance(progress.metersToNextManeuver)
                    : "…"}
                </span>
                <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
                  dopo
                </span>
              </div>
              <div className="min-w-0 flex-1 px-3 py-3">
                {progress && progress.totalWaypoints > 1 ? (
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--brand)] uppercase">
                    {progress.nextWaypointKind === "destination"
                      ? "Destinazione"
                      : `Tappa ${(progress.nextWaypointIndex ?? 0) + 1}/${progress.totalWaypoints}`}
                    {progress.nextWaypointLabel
                      ? ` · ${progress.nextWaypointLabel}`
                      : ""}
                    {progress.metersToNextWaypoint > 0
                      ? ` · ${formatDistance(progress.metersToNextWaypoint)}`
                      : ""}
                  </p>
                ) : null}
                <p
                  className={cn(
                    "font-[family-name:var(--font-display)] leading-snug text-[var(--ink)]",
                    landscape ? "text-base" : "text-lg",
                  )}
                >
                  {navigation.status === "starting"
                    ? "Ricerca GPS…"
                    : recalcBusy
                      ? "Aggiornamento percorso…"
                      : (next?.instruction ?? "Segui il percorso")}
                </p>
                {roadHint && !recalcBusy ? (
                  <p className="mt-1 truncate text-xs font-medium text-[var(--ink-muted)]">
                    su {roadHint}
                  </p>
                ) : null}
              </div>
            </div>

            {metrics && !needsReroute ? (
              <div
                className={cn(
                  "grid gap-1 border-t border-[var(--line)] px-2 py-2.5 text-center",
                  landscape ? "grid-cols-2" : "grid-cols-4",
                )}
              >
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
            ) : metrics && needsReroute ? (
              <div className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--ink-muted)]">
                Stime sospese finché non rientri sul percorso o ricalcoli.
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
              {landscape ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setNavigationHudSide(hudLeft ? "right" : "left")
                  }
                  aria-label={
                    hudLeft
                      ? "Sposta pannello a destra"
                      : "Sposta pannello a sinistra"
                  }
                  title="Sposta pannello"
                >
                  {hudLeft ? (
                    <PanelRight className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeft className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : null}
              {!navigation.followMap ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => recenterNavigation()}
                  aria-label="Riposiziona GPS"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </Button>
              ) : null}
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
    </>
  );
}
