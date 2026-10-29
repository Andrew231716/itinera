"use client";

import {
  Compass,
  MapPin,
  Navigation,
  Smartphone,
  Sun,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import { useNavRecalculate } from "@/hooks/useNavRecalculate";
import { formatDistance, formatDuration } from "@/lib/utils/format";
import {
  Badge,
  Button,
  EmptyHint,
  SectionTitle,
} from "@/components/ui/primitives";
import { PanelResetButton } from "@/components/ui/PanelResetButton";
import { requestCompassPermission } from "@/hooks/useDeviceHeading";
import { SiriGuide } from "@/components/trip/SiriGuide";

/** Setup / idle view for the Naviga tab. Active driving UI is DrivingHud. */
export function NavigatorPanel() {
  const trip = useTripStore((s) => s.trip);
  const routes = useTripStore((s) => s.routes);
  const navigation = useTripStore((s) => s.navigation);
  const startNavigation = useTripStore((s) => s.startNavigation);
  const stopNavigation = useTripStore((s) => s.stopNavigation);
  const setNavigationVoice = useTripStore((s) => s.setNavigationVoice);
  const setNavigationFollowMap = useTripStore((s) => s.setNavigationFollowMap);
  const { recalculateFromHere, busy: recalcBusy } = useNavRecalculate();

  const selected =
    routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0] ?? null;
  const active =
    navigation.status === "navigating" ||
    navigation.status === "off_route" ||
    navigation.status === "starting" ||
    navigation.status === "arrived";

  const progress = navigation.progress;
  const next = progress?.nextManeuver;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Navigazione"
        subtitle="Guidato Itinera: segue il percorso calcolato (esclusioni incluse)"
        action={
          <PanelResetButton
            disabled={!active}
            onClick={stopNavigation}
            label="Reset"
          />
        }
      />

      {!selected ? (
        <EmptyHint>
          Calcola prima un percorso dal tab Riepilogo, poi avvia la navigazione
          qui. Le esclusioni restano quelle di Itinera — non dipendono da Google
          Maps.
        </EmptyHint>
      ) : (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
          Percorso:{" "}
          <span className="font-medium text-[var(--ink)]">{selected.label}</span>
          {" · "}
          {formatDistance(selected.distanceMeters)} ·{" "}
          {formatDuration(selected.durationSeconds)}
          {selected.isConformant === false ? (
            <span className="mt-1 block text-amber-800">
              Attenzione: questo percorso non rispetta tutte le esclusioni hard.
            </span>
          ) : selected.isConformant ? (
            <span className="mt-1 block text-emerald-800">
              Conforme alle esclusioni verificate.
            </span>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!active ? (
          <Button
            type="button"
            disabled={!selected}
            onClick={() => {
              void requestCompassPermission().finally(() => {
                startNavigation();
              });
            }}
          >
            <Navigation className="h-4 w-4" />
            Avvia navigazione
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => stopNavigation()}>
            <X className="h-4 w-4" />
            Termina
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setNavigationVoice(!navigation.voiceEnabled)}
        >
          {navigation.voiceEnabled ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
          {navigation.voiceEnabled ? "Voce on" : "Voce off"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setNavigationFollowMap(!navigation.followMap)}
        >
          <Compass className="h-3.5 w-3.5" />
          {navigation.followMap ? "Segui mappa" : "Mappa libera"}
        </Button>
      </div>

      {navigation.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {navigation.error}
        </div>
      ) : null}

      {navigation.status === "starting" ? (
        <EmptyHint>Attendo posizione GPS…</EmptyHint>
      ) : null}

      {navigation.status === "arrived" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          Sei arrivato a destinazione.
        </div>
      ) : null}

      {navigation.status === "off_route" ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>
            Fuori percorso (
            {progress
              ? formatDistance(progress.crossTrackMeters)
              : "—"}{" "}
            dalla linea Itinera).
          </p>
          <Button
            type="button"
            size="sm"
            disabled={recalcBusy || !navigation.position}
            onClick={() => void recalculateFromHere()}
          >
            {recalcBusy
              ? "Ricalcolo…"
              : "Ricalcola da qui (con esclusioni)"}
          </Button>
        </div>
      ) : null}

      {active && next ? (
        <div className="space-y-3 rounded-2xl border border-[var(--brand)]/30 bg-[var(--brand-soft)]/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="brand">Prossima manovra</Badge>
            <span className="text-sm font-semibold text-[var(--ink)]">
              {formatDistance(progress?.metersToNextManeuver ?? 0)}
            </span>
          </div>
          <p className="font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--ink)]">
            {next.instruction}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-[var(--ink-muted)]">
            <div>
              Rimanenti:{" "}
              <span className="font-semibold text-[var(--ink)]">
                {formatDistance(progress?.remainingMeters ?? 0)}
              </span>
            </div>
            <div>
              Tempo:{" "}
              <span className="font-semibold text-[var(--ink)]">
                {formatDuration(progress?.remainingSeconds ?? 0)}
              </span>
            </div>
            <div className="col-span-2 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              GPS{" "}
              {navigation.accuracyMeters != null
                ? `±${Math.round(navigation.accuracyMeters)} m`
                : "…"}
              {navigation.speedMps != null && navigation.speedMps > 0.5
                ? ` · ${Math.round(navigation.speedMps * 3.6)} km/h`
                : ""}
            </div>
          </div>
        </div>
      ) : null}

      {active && navigation.status !== "arrived" ? (
        <div className="flex flex-wrap gap-2 text-[11px] text-[var(--ink-muted)]">
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1">
            <Sun className="h-3 w-3" />
            {navigation.wakeLockMode === "wake-lock"
              ? "Schermo acceso (Wake Lock)"
              : navigation.wakeLockMode === "audio-fallback"
                ? "Keepalive audio (no Wake Lock)"
                : navigation.wakeLockMode === "unsupported"
                  ? "Wake Lock non supportato"
                  : "Wake Lock…"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1">
            <Smartphone className="h-3 w-3" />
            {navigation.platform === "capacitor"
              ? "App nativa (GPS background)"
              : "PWA / browser"}
          </span>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
        Navigatore guidato: polyline Itinera, limite velocità e segnalazioni
        (autovelox, semafori, controlli, lavori) da OpenStreetMap lungo il
        percorso. In PWA lo schermo resta acceso con Wake Lock; GPS in
        background richiede l&apos;app Capacitor (vedi MOBILE_APP.md). Dati
        mappa © OpenStreetMap contributors.
      </div>

      {!active ? (
        <div className="border-t border-[var(--line)] pt-4">
          <SiriGuide compact />
        </div>
      ) : null}
    </div>
  );
}
