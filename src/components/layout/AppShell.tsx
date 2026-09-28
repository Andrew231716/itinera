"use client";

import {
  Copy,
  History,
  Layers3,
  Map as MapIcon,
  CircleParking,
  Route,
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
  Settings2,
} from "lucide-react";
import { useEffect } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { useTripStore, type PanelTab } from "@/lib/store/trip-store";
import {
  formatDistance,
  formatDuration,
  formatRelativeIt,
} from "@/lib/utils/format";
import { Button, cn } from "@/components/ui/primitives";
import { TripForm } from "@/components/trip/TripForm";
import { PreferencesPanel } from "@/components/trip/PreferencesPanel";
import { ExclusionsPanel } from "@/components/trip/ExclusionsPanel";
import { RouteSummary } from "@/components/trip/RouteSummary";
import { NaturalLanguageAssistant } from "@/components/trip/NaturalLanguageAssistant";
import { SetupPanel } from "@/components/trip/SetupPanel";
import { SavedPanel } from "@/components/trip/SavedPanel";
import { ParkingPanel } from "@/components/trip/ParkingPanel";
import { MapCanvas } from "@/components/map/MapCanvas";
import { StatusBanner } from "@/components/status/StatusBanner";

const TABS: Array<{ id: PanelTab; label: string; icon: typeof Route }> = [
  { id: "itinerary", label: "Itinerario", icon: MapIcon },
  { id: "preferences", label: "Percorso", icon: SlidersHorizontal },
  { id: "exclusions", label: "Esclusioni", icon: ShieldAlert },
  { id: "parking", label: "Parcheggi", icon: CircleParking },
  { id: "summary", label: "Riepilogo", icon: Layers3 },
  { id: "saved", label: "Cronologia", icon: History },
  { id: "assistant", label: "Assistente", icon: Sparkles },
  { id: "setup", label: "Live", icon: Settings2 },
];

export function AppShell() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const activePanel = useTripStore((s) => s.activePanel);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const mobilePanelOpen = useTripStore((s) => s.mobilePanelOpen);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);
  const routeMode = useTripStore((s) => s.routeMode);
  const setMapsConfig = useTripStore((s) => s.setMapsConfig);
  const persistTrip = useTripStore((s) => s.persistTrip);
  const refreshSavedTrips = useTripStore((s) => s.refreshSavedTrips);
  const refreshTripHistory = useTripStore((s) => s.refreshTripHistory);
  const loadTrip = useTripStore((s) => s.loadTrip);
  const loadHistoryEntry = useTripStore((s) => s.loadHistoryEntry);
  const savedTrips = useTripStore((s) => s.savedTrips);
  const tripHistory = useTripStore((s) => s.tripHistory);
  const trip = useTripStore((s) => s.trip);
  const { computeRoute } = useRouteCompute();

  useEffect(() => {
    fetch("/api/maps/config")
      .then((r) => r.json())
      .then((data) => {
        setMapsConfig(
          data.mapsMode === "live" ? "live" : "demo",
          data.browserKey ?? null,
        );
      })
      .catch(() => setMapsConfig("demo", null));
    void refreshSavedTrips();
    refreshTripHistory();
  }, [setMapsConfig, refreshSavedTrips, refreshTripHistory]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tripId = params.get("trip");
    if (!tripId) return;
    void (async () => {
      await refreshSavedTrips();
      const found = useTripStore
        .getState()
        .savedTrips.find((t) => t.meta.id === tripId);
      if (found) loadTrip(found);
    })();
  }, [loadTrip, refreshSavedTrips]);

  const recentHistory = tripHistory.slice(0, 4);

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-[var(--mist)]">
      <div className="absolute inset-0 lg:left-[min(420px,38vw)]">
        <MapCanvas />
        <StatusBanner />
      </div>

      <aside
        className={cn(
          "absolute z-30 flex flex-col border-[var(--line)] bg-[var(--surface)]/95 shadow-[0_20px_60px_rgba(36,52,71,0.14)] backdrop-blur-xl transition-transform duration-300 ease-out",
          isDesktop
            ? "top-0 left-0 h-full w-[min(420px,38vw)] border-r"
            : cn(
                "inset-x-0 bottom-0 max-h-[78dvh] rounded-t-3xl border-t",
                mobilePanelOpen ? "translate-y-0" : "translate-y-[calc(100%-4.5rem)]",
              ),
        )}
      >
        {!isDesktop ? (
          <button
            type="button"
            className="flex w-full flex-col items-center pt-2 pb-1"
            onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
            aria-label={mobilePanelOpen ? "Chiudi pannello" : "Apri pannello"}
          >
            <span className="h-1 w-10 rounded-full bg-[var(--surface-3)]" />
          </button>
        ) : null}

        <header className="shrink-0 border-b border-[var(--line)] px-4 pt-3 pb-3 lg:px-5 lg:pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                Intelligent Route Planner
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-[1.75rem] leading-none tracking-tight text-[var(--ink)]">
                Itinera
              </h1>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Percorsi su misura, tappe e vincoli reali
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void persistTrip()}
              title="Salva in locale"
            >
              <Copy className="h-3.5 w-3.5" />
              Salva
            </Button>
          </div>

          <nav className="mt-4 flex gap-1 overflow-x-auto pb-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activePanel === tab.id;
              const badge =
                tab.id === "saved" && tripHistory.length > 0
                  ? tripHistory.length
                  : null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActivePanel(tab.id);
                    setMobilePanelOpen(true);
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium transition",
                    active
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : "bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {badge != null ? (
                    <span
                      className={cn(
                        "rounded-md px-1 text-[10px] font-semibold",
                        active
                          ? "bg-white/20"
                          : "bg-[var(--brand-soft)] text-[var(--brand)]",
                      )}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5">
          {activePanel === "itinerary" ? <TripForm /> : null}
          {activePanel === "preferences" ? <PreferencesPanel /> : null}
          {activePanel === "exclusions" ? <ExclusionsPanel /> : null}
          {activePanel === "summary" ? <RouteSummary /> : null}
          {activePanel === "parking" ? <ParkingPanel /> : null}
          {activePanel === "assistant" ? <NaturalLanguageAssistant /> : null}
          {activePanel === "saved" ? <SavedPanel /> : null}
          {activePanel === "setup" ? <SetupPanel /> : null}

          {recentHistory.length > 0 && activePanel === "itinerary" ? (
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <History className="h-3 w-3" />
                Cronologia recente
              </p>
              <div className="space-y-1.5">
                {recentHistory.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={cn(
                      "w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-2)]",
                      entry.trip.meta.id === trip.meta.id &&
                        "bg-[var(--brand-soft)]/50",
                    )}
                    onClick={() => loadHistoryEntry(entry)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--ink)]">
                        {entry.trip.origin?.label ?? "?"} →{" "}
                        {entry.trip.destination?.label ?? "?"}
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--ink-faint)]">
                        {formatRelativeIt(entry.computedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">
                      {entry.routeSummary?.distanceMeters != null
                        ? formatDistance(entry.routeSummary.distanceMeters)
                        : entry.trip.meta.title}
                      {entry.routeSummary?.durationSeconds != null
                        ? ` · ${formatDuration(entry.routeSummary.durationSeconds)}`
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => setActivePanel("saved")}
              >
                Apri cronologia
              </Button>
            </div>
          ) : savedTrips.length > 0 && activePanel === "itinerary" ? (
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Viaggi salvati
              </p>
              <div className="space-y-1.5">
                {savedTrips.slice(0, 3).map((t) => (
                  <button
                    key={t.meta.id}
                    type="button"
                    className={cn(
                      "w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-2)]",
                      t.meta.id === trip.meta.id && "bg-[var(--brand-soft)]/50",
                    )}
                    onClick={() => loadTrip(t)}
                  >
                    <span className="font-medium text-[var(--ink)]">
                      {t.meta.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">
                      {t.origin?.label ?? "?"} → {t.destination?.label ?? "?"}
                    </span>
                  </button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => setActivePanel("saved")}
              >
                Apri Salvati
              </Button>
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)]/90 p-3 lg:p-4">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={
              routeMode === "loading" || !trip.origin || !trip.destination
            }
            onClick={() => {
              void computeRoute();
              setActivePanel("summary");
              setMobilePanelOpen(true);
            }}
          >
            <Route className="h-4 w-4" />
            {routeMode === "loading" ? "Calcolo…" : "Calcola percorso"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
