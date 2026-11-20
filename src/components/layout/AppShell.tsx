"use client";

import {
  Copy,
  Menu,
  Undo2,
  History,
  Layers3,
  ListOrdered,
  Map as MapIcon,
  CircleParking,
  Fuel,
  Moon,
  Navigation,
  Route,
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTravelWorkspace } from "@/hooks/useTravelWorkspace";
import { useSyncState } from "@/hooks/useSyncState";
import { WorkspaceTools } from "@/components/trip/WorkspaceTools";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { useNavigation } from "@/hooks/useNavigation";
import { useNavAlerts } from "@/hooks/useNavAlerts";
import { requestCompassPermission } from "@/hooks/useDeviceHeading";
import { useTheme } from "@/hooks/useTheme";
import { useTripStore, type PanelTab } from "@/lib/store/trip-store";
import {
  formatDistance,
  formatDuration,
  formatRelativeIt,
} from "@/lib/utils/format";
import { Button, cn } from "@/components/ui/primitives";
import { TripForm } from "@/components/trip/TripForm";
const GiroPanel = dynamic(() => import("@/components/trip/GiroPanel").then(module => module.GiroPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const TravelRulesPanel = dynamic(() => import("@/components/trip/TravelRulesPanel").then(module => module.TravelRulesPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const ExclusionsPanel = dynamic(() => import("@/components/trip/ExclusionsPanel").then(module => module.ExclusionsPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const RouteSummary = dynamic(() => import("@/components/trip/RouteSummary").then(module => module.RouteSummary), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const NaturalLanguageAssistant = dynamic(() => import("@/components/trip/NaturalLanguageAssistant").then(module => module.NaturalLanguageAssistant), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const SetupPanel = dynamic(() => import("@/components/trip/SetupPanel").then(module => module.SetupPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const SavedPanel = dynamic(() => import("@/components/trip/SavedPanel").then(module => module.SavedPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const ParkingPanel = dynamic(() => import("@/components/trip/ParkingPanel").then(module => module.ParkingPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const FuelPanel = dynamic(() => import("@/components/trip/FuelPanel").then(module => module.FuelPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
const NavigatorPanel = dynamic(() => import("@/components/trip/NavigatorPanel").then(module => module.NavigatorPanel), { loading: () => <p role="status" className="py-4 text-sm">Apertura sezione…</p> });
import { DrivingHud } from "@/components/trip/DrivingHud";
import { VoiceGoControl } from "@/components/trip/VoiceGoControl";
import { MapCanvas } from "@/components/map/MapCanvas";
import { StatusBanner } from "@/components/status/StatusBanner";

const TABS: Array<{ id: PanelTab; label: string; icon: typeof Route }> = [
  { id: "itinerary", label: "Itinerario", icon: MapIcon },
  { id: "giro", label: "Giro", icon: ListOrdered },
  { id: "preferences", label: "Regole", icon: SlidersHorizontal },
  { id: "exclusions", label: "Esclusioni", icon: ShieldAlert },
  { id: "summary", label: "Riepilogo", icon: Layers3 },
  { id: "navigate", label: "Naviga", icon: Navigation },
  { id: "parking", label: "Parcheggi", icon: CircleParking },
  { id: "fuel", label: "Benzinai", icon: Fuel },
  { id: "saved", label: "Salvati", icon: History },
  { id: "assistant", label: "Assistente", icon: Sparkles },
  { id: "setup", label: "Stato servizi", icon: Settings2 },
];

export function AppShell() {
  const workspace = useTravelWorkspace();
  const sync = useSyncState();
  const canUndo = useTripStore((s) => s.canUndo);
  const undoTripChange = useTripStore((s) => s.undoTripChange);
  const routeNeedsUpdate = useTripStore((s) => s.routeNeedsUpdate);
  const [saveMessage, setSaveMessage] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [visited, setVisited] = useState<PanelTab[]>(["itinerary"]);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isLandscapeMobile = useMediaQuery(
    "(max-width: 1023px) and (orientation: landscape)",
  );
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
  const routes = useTripStore((s) => s.routes);
  const navigation = useTripStore((s) => s.navigation);
  const startNavigation = useTripStore((s) => s.startNavigation);
  const { computeRoute } = useRouteCompute();
  useNavigation();
  useNavAlerts();
  const { theme, toggleTheme } = useTheme();
  const hasRoute = routes.length > 0;
  const driving =
    navigation.status === "navigating" ||
    navigation.status === "off_route" ||
    navigation.status === "starting" ||
    navigation.status === "arrived";

  useEffect(() => {
    fetch("/api/maps/config")
      .then((r) => r.json())
      .then((data) => {
        setMapsConfig(
          data.mapsMode === "live" ? "live" : "demo",
          data.browserKey ?? null,
          data.mapId ?? null,
        );
      })
      .catch(() => setMapsConfig("demo", null, null));
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

  useEffect(() => {
    setVisited((previous) =>
      previous.includes(activePanel) ? previous : [...previous, activePanel],
    );
  }, [activePanel]);
  const primaryTabs = TABS.filter((tab) =>
    ["itinerary", "giro", "navigate", "saved"].includes(tab.id),
  );
  const extraTabs = TABS.filter(
    (tab) => !primaryTabs.includes(tab) && tab.id !== "exclusions",
  );
  function openPanel(tab: PanelTab) {
    setActivePanel(tab);
    setMobilePanelOpen(true);
    setMoreOpen(false);
  }
  const panels = {
    itinerary: <TripForm />,
    giro: <GiroPanel />,
    preferences: <TravelRulesPanel />,
    exclusions: <ExclusionsPanel />,
    summary: <RouteSummary />,
    parking: <ParkingPanel />,
    fuel: <FuelPanel />,
    navigate: <NavigatorPanel />,
    assistant: <NaturalLanguageAssistant />,
    saved: (
      <>
        <SavedPanel />
        <WorkspaceTools />
      </>
    ),
    setup: (
      <>
        <SetupPanel />
        <WorkspaceTools />
      </>
    ),
  };
  const recentHistory = tripHistory.slice(0, 4);
  const sidePanel = isDesktop || isLandscapeMobile;

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-[var(--mist)]">
      <div
        className={cn(
          // z-0 traps floating map controls so they cannot sit above the trip panel (z-30).
          "absolute inset-0 z-0",
          sidePanel && !driving
            ? isDesktop
              ? "left-[min(420px,38vw)]"
              : mobilePanelOpen
                ? "left-[min(340px,46vw)]"
                : ""
            : "",
        )}
      >
        <MapCanvas />
        {!driving ? <StatusBanner /> : null}
        {driving ? <DrivingHud /> : null}
        {!driving ? <VoiceGoControl /> : null}
      </div>

      <aside
        className={cn(
          "absolute z-30 flex flex-col border-[var(--line)] bg-[var(--surface)]/95 shadow-[0_20px_60px_var(--shadow-panel)] backdrop-blur-xl transition-transform duration-300 ease-out",
          sidePanel
            ? cn(
                "top-0 left-0 h-full border-r",
                isDesktop ? "w-[min(420px,38vw)]" : "w-[min(340px,46vw)]",
                driving && "-translate-x-full pointer-events-none",
                isLandscapeMobile &&
                  !driving &&
                  !mobilePanelOpen &&
                  "-translate-x-[calc(100%-2.75rem)]",
              )
            : cn(
                "inset-x-0 bottom-0 max-h-[78dvh] rounded-t-3xl border-t",
                driving
                  ? "translate-y-full pointer-events-none"
                  : mobilePanelOpen
                    ? "translate-y-0"
                    : "translate-y-[calc(100%-11.75rem)]",
              ),
        )}
      >
        {!sidePanel ? (
          <button
            type="button"
            className="flex w-full flex-col items-center pt-2 pb-1"
            onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
            aria-label={mobilePanelOpen ? "Chiudi pannello" : "Apri pannello"}
          >
            <span className="h-1 w-10 rounded-full bg-[var(--surface-3)]" />
          </button>
        ) : isLandscapeMobile ? (
          <button
            type="button"
            className="absolute top-1/2 right-0 z-10 flex h-16 w-2.5 -translate-y-1/2 translate-x-full items-center justify-center rounded-r-lg border border-l-0 border-[var(--line)] bg-[var(--surface)]"
            onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
            aria-label={
              mobilePanelOpen ? "Comprimi pannello" : "Espandi pannello"
            }
          >
            <span className="h-8 w-1 rounded-full bg-[var(--surface-3)]" />
          </button>
        ) : null}

        <header
          className={cn(
            "shrink-0 border-b border-[var(--line)] px-4 pt-3 pb-3 lg:px-5 lg:pt-5",
            isLandscapeMobile && "px-3 pt-2 pb-2",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                Il tuo viaggio, in ordine
              </p>
              <h1
                className={cn(
                  "font-[family-name:var(--font-display)] leading-none tracking-tight text-[var(--ink)]",
                  isLandscapeMobile ? "text-xl" : "text-[1.75rem]",
                )}
              >
                Itinera
              </h1>
              {!isLandscapeMobile ? (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Percorsi su misura, tappe e vincoli reali
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={toggleTheme}
                title={theme === "dark" ? "Modalità chiara" : "Modalità scura"}
                aria-label={
                  theme === "dark"
                    ? "Attiva modalità chiara"
                    : "Attiva modalità scura"
                }
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSaveMessage("Salvataggio…");
                  void persistTrip()
                    .then(() => setSaveMessage("Salvato sul dispositivo"))
                    .catch(() =>
                      setSaveMessage(
                        "Salvataggio non riuscito. Esporta un backup.",
                      ),
                    );
                }}
                title="Salva in locale"
              >
                <Copy className="h-3.5 w-3.5" />
                Salva
              </Button>
            </div>
          </div>

          <nav className="primary-nav" aria-label="Sezioni principali">
            {primaryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-current={activePanel === tab.id ? "page" : undefined}
                onClick={() => openPanel(tab.id)}
              >
                <tab.icon size={19} />
                <span>{tab.label}</span>
              </button>
            ))}
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="itinera-more"
              aria-current={
                extraTabs.some((tab) => tab.id === activePanel)
                  ? "page"
                  : undefined
              }
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <Menu size={19} />
              <span>Altro</span>
            </button>
          </nav>
          {moreOpen && (
            <nav
              id="itinera-more"
              className="more-nav"
              aria-label="Altre sezioni"
            >
              {extraTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={activePanel === tab.id ? "page" : undefined}
                  onClick={() => openPanel(tab.id)}
                >
                  <tab.icon size={18} />
                  {tab.label}
                </button>
              ))}
            </nav>
          )}
          <div
            className="flex items-center justify-between gap-2 pt-2 text-xs text-[var(--ink-muted)]"
            role="status"
          >
            <span>
              {workspace.offline
                ? "Offline · dati sul dispositivo"
                : sync.running
                  ? "Aggiornamento cloud…"
                  : sync.pending
                    ? `${sync.pending} modifiche in attesa del cloud`
                    : saveMessage}
            </span>
            {canUndo && (
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1 text-[var(--brand)]"
                onClick={undoTripChange}
              >
                <Undo2 size={15} />
                Annulla
              </button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-8 lg:px-5">
          {workspace.storageError && (
            <p role="alert" className="workspace-card mb-3 text-sm">
              {workspace.storageError}
            </p>
          )}
          {routeNeedsUpdate && (
            <p role="status" className="workspace-card mb-3 text-sm">
              Il viaggio è cambiato. Calcola il percorso aggiornato prima di
              avviare la guida.
            </p>
          )}
          {workspace.resume &&
            activePanel === "itinerary" &&
            !trip.origin &&
            !trip.destination && (
              <div className="resume-card">
                <p className="text-xs font-semibold uppercase tracking-wide">
                  Riprendi il tuo viaggio
                </p>
                <h2 className="text-lg font-semibold">
                  {workspace.resume.title}
                </h2>
                <p className="text-sm">
                  {workspace.resume.trip.origin?.label ??
                    "Partenza da scegliere"}{" "}
                  →{" "}
                  {workspace.resume.trip.destination?.label ??
                    "Arrivo da scegliere"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={() => {
                      useTripStore
                        .getState()
                        .loadOfflinePack(workspace.resume!);
                      workspace.dismissResume();
                    }}
                  >
                    Riprendi
                  </Button>
                  <Button variant="ghost" onClick={workspace.dismissResume}>
                    Nuovo viaggio
                  </Button>
                </div>
              </div>
            )}
          {visited.map((panel) => (
            <div key={panel} hidden={panel !== activePanel} data-panel={panel}>
              {panels[panel]}
            </div>
          ))}

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

        {!driving ? (
          <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)]/90 p-3 lg:p-4">
            {hasRoute ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    void requestCompassPermission().finally(() => {
                      startNavigation();
                    });
                  }}
                >
                  <Navigation className="h-4 w-4" />
                  Avvia navigazione
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
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
                  <Route className="h-3.5 w-3.5" />
                  {routeMode === "loading" ? "Calcolo…" : "Ricalcola percorso"}
                </Button>
              </div>
            ) : (
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
            )}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
