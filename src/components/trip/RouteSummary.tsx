"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Navigation,
  Route,
  Share2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import {
  buildGoogleMapsDirectionsLink,
  buildShareTripUrl,
  exportDirectionsText,
  exportStopsList,
  nativeShare,
  openMapsDirectionsUrl,
} from "@/lib/google/maps-links";
import { getTripRepository } from "@/lib/storage/trip-repository";
import { getTrafficInfo } from "@/lib/routing/traffic-info";
import { formatDistance, formatDuration, formatCurrency } from "@/lib/utils/format";
import {
  Badge,
  Button,
  EmptyHint,
  SectionTitle,
} from "@/components/ui/primitives";
import { TrafficMonitorPanel } from "@/components/trip/TrafficMonitorPanel";

export function RouteSummary() {
  const trip = useTripStore((s) => s.trip);
  const routes = useTripStore((s) => s.routes);
  const routeMode = useTripStore((s) => s.routeMode);
  const routeError = useTripStore((s) => s.routeError);
  const routeLimitations = useTripStore((s) => s.routeLimitations);
  const setSelectedRoute = useTripStore((s) => s.setSelectedRoute);

  const selected =
    routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0] ?? null;

  const mapsLink = useMemo(() => {
    if (!trip.origin || !trip.destination) return null;
    return buildGoogleMapsDirectionsLink({
      origin: trip.origin,
      destination: trip.destination,
      stops: trip.stops.map((s) => s.place),
      travelMode: trip.travelMode,
      preferences: trip.preferences,
      // Solo tappe scelte dall’utente — niente punti intermedi inventati dalla geometria.
      routeLabel: selected?.label,
    });
  }, [trip, selected]);

  const [copied, setCopied] = useState<string | null>(null);

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Riepilogo percorso"
        subtitle="Dati provenienti solo dal motore di routing — mai inventati"
      />

      {routeMode === "loading" ? (
        <EmptyHint>Calcolo del percorso in corso…</EmptyHint>
      ) : null}

      {routeError ? (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{routeError}</p>
        </div>
      ) : null}

      {routeMode === "demo" ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone="demo">Demo</Badge>
            <span className="font-medium">Nessun percorso inventato</span>
          </div>
          <p className="text-xs leading-relaxed text-sky-800">
            Configura <code className="rounded bg-white/70 px-1">GOOGLE_MAPS_API_KEY</code>{" "}
            per calcolare itinerari reali con Google Routes API.
          </p>
        </div>
      ) : null}

      {routes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Alternative
          </p>
          {routes.every((r) => r.isConformant === false) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Nessun percorso rispetta ancora tutte le esclusioni hard. Google non
              ha avoid-area nativi: ho già tentato delle deviazioni automatiche.
              Prova a ridurre un raggio, togliere un’esclusione o aggiungere una
              tappa che forzi il passaggio altrove.
            </div>
          ) : null}

          {routes.map((route) => {
            const active = selected?.id === route.id;
            const hard = route.violations.filter((v) => v.severity === "hard");
            const traffic = getTrafficInfo(route);
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => setSelectedRoute(route.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]/50"
                    : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    {route.label}
                  </span>
                  {route.isConformant === true ? (
                    <Badge tone="ok">Conforme</Badge>
                  ) : hard.length > 0 ? (
                    <Badge tone="warn">{hard.length} vincoli</Badge>
                  ) : (
                    <Badge tone="neutral">Non verificato</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--ink-muted)]">
                  <span>{formatDistance(route.distanceMeters)}</span>
                  <span>{formatDuration(route.durationSeconds)}</span>
                  {traffic.level !== "unknown" ? (
                    <span>
                      {traffic.label}
                      {traffic.delaySeconds >= 60
                        ? ` (+${Math.round(traffic.delaySeconds / 60)} min)`
                        : ""}
                    </span>
                  ) : null}
                  {route.tolls?.hasTolls || route.tolls?.michelin ? (
                    <span>
                      {route.tolls.estimatedPrice != null
                        ? `Pedaggi ${formatCurrency(
                            route.tolls.estimatedPrice,
                            route.tolls.currencyCode ?? "EUR",
                          )}`
                        : route.tolls.michelin?.estimatedPrice != null
                          ? `Pedaggi VM ${formatCurrency(
                              route.tolls.michelin.estimatedPrice,
                              route.tolls.michelin.currencyCode ?? "EUR",
                            )}`
                          : "Pedaggi"}
                      {route.tolls.estimatedPrice != null &&
                      route.tolls.michelin?.estimatedPrice != null
                        ? ` · VM ${formatCurrency(
                            route.tolls.michelin.estimatedPrice,
                            route.tolls.michelin.currencyCode ?? "EUR",
                          )}`
                        : ""}
                    </span>
                  ) : null}
                  {route.zoneAdvisories && route.zoneAdvisories.length > 0 ? (
                    <span>
                      {route.zoneAdvisories.map((z) => z.label).join(" · ")}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : routeMode === "idle" || routeMode === "error" ? (
        <EmptyHint>
          Calcola il percorso per vedere distanza, durata, tratte e indicazioni.
        </EmptyHint>
      ) : null}

      {selected ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Distanza" value={formatDistance(selected.distanceMeters)} />
            <Stat label="Durata" value={formatDuration(selected.durationSeconds)} />
            {selected.tolls?.hasTolls || selected.tolls?.michelin ? (
              <Stat
                label="Pedaggi"
                value={
                  selected.tolls.estimatedPrice != null
                    ? formatCurrency(
                        selected.tolls.estimatedPrice,
                        selected.tolls.currencyCode ?? "EUR",
                      )
                    : selected.tolls.michelin?.estimatedPrice != null
                      ? formatCurrency(
                          selected.tolls.michelin.estimatedPrice,
                          selected.tolls.michelin.currencyCode ?? "EUR",
                        )
                      : "Presenti"
                }
              />
            ) : (
              <Stat label="Pedaggi" value="Nessuno" />
            )}
            <Stat
              label="Zone MI"
              value={
                selected.zoneAdvisories && selected.zoneAdvisories.length > 0
                  ? selected.zoneAdvisories.map((z) =>
                      z.id === "area_c" ? "Area C" : z.id === "area_b" ? "Area B" : z.label,
                    ).join(" + ")
                  : "—"
              }
            />
          </div>

          <TrafficMonitorPanel route={selected} />

          {selected.tolls?.hasTolls || selected.tolls?.michelin ? (
            <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
              {selected.tolls?.estimatedPrice != null ? (
                <p>
                  Google Routes:{" "}
                  <span className="font-semibold text-[var(--ink)]">
                    {formatCurrency(
                      selected.tolls.estimatedPrice,
                      selected.tolls.currencyCode ?? "EUR",
                    )}
                  </span>{" "}
                  (stima ufficiale API; può variare per classe veicolo / Telepass).
                </p>
              ) : selected.tolls?.hasTolls ? (
                <p>
                  Google indica pedaggi sul percorso ma non ha restituito
                  l’importo.
                </p>
              ) : null}

              {selected.tolls?.michelin ? (
                <div className="space-y-1 border-t border-[var(--line)] pt-2">
                  <p>
                    ViaMichelin
                    {selected.tolls.michelin.matchedSummary
                      ? ` (${selected.tolls.michelin.matchedSummary})`
                      : ""}
                    :{" "}
                    <span className="font-semibold text-[var(--ink)]">
                      {selected.tolls.michelin.estimatedPrice != null
                        ? formatCurrency(
                            selected.tolls.michelin.estimatedPrice,
                            selected.tolls.michelin.currencyCode ?? "EUR",
                          )
                        : "n/d"}
                    </span>
                    {selected.tolls.michelin.estimatedPrice != null
                      ? " di pedaggi autostradali"
                      : ""}
                    .
                  </p>
                  {selected.tolls.michelin.barriers &&
                  selected.tolls.michelin.barriers.length > 0 ? (
                    <p>
                      Caselli:{" "}
                      {selected.tolls.michelin.barriers
                        .map((b) =>
                          b.amount != null
                            ? `${b.name} (${formatCurrency(
                                b.amount,
                                b.currencyCode ?? "EUR",
                              )})`
                            : b.name,
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                  {selected.tolls.michelin.vignettes &&
                  selected.tolls.michelin.vignettes.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {selected.tolls.michelin.vignettes.map((v) => (
                        <li key={`${v.name}-${v.amount ?? 0}`}>
                          {v.name}
                          {v.amount != null
                            ? ` — ${formatCurrency(
                                v.amount,
                                v.currencyCode ?? "EUR",
                              )}`
                            : ""}
                          {v.message ? ` (${v.message})` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-[10px] leading-relaxed text-[var(--ink-faint)]">
                    Stima indipendente dal sito ViaMichelin: può riferirsi a
                    un’alternativa diversa dal tratto Google selezionato.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {selected.zoneAdvisories && selected.zoneAdvisories.length > 0 ? (
            <div className="space-y-1.5">
              {selected.zoneAdvisories.map((z) => (
                <div
                  key={z.id}
                  className={`rounded-lg px-2.5 py-2 text-xs ${
                    z.kind === "ztl"
                      ? "bg-red-50 text-red-900"
                      : "bg-orange-50 text-orange-950"
                  }`}
                >
                  <p className="font-semibold">
                    {z.kind === "ztl" ? "ZTL" : "Limitazione"} — {z.label}
                  </p>
                  <p className="mt-0.5 leading-relaxed">{z.message}</p>
                </div>
              ))}
            </div>
          ) : null}

          {selected.violations.length > 0 ? (
            <div className="space-y-1.5">
              {selected.violations.map((v) => (
                <div
                  key={`${v.exclusionId}-${v.message}`}
                  className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
                >
                  {v.message}
                </div>
              ))}
            </div>
          ) : null}

          {selected.unverifiableConstraints &&
          selected.unverifiableConstraints.length > 0 ? (
            <div className="space-y-1.5">
              {selected.unverifiableConstraints.map((u) => (
                <div
                  key={`${u.exclusionId}-${u.reason}`}
                  className="rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-sky-900"
                >
                  Non verificabile — {u.exclusionLabel}: {u.reason}
                </div>
              ))}
            </div>
          ) : null}

          {selected.isConformant === false ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              Percorso non dichiarato conforme ai vincoli obbligatori.
            </div>
          ) : selected.isConformant === true ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
              Nessuna violazione hard verificata su questo percorso.
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Tratte
            </p>
            <ul className="space-y-2">
              {selected.legs.map((leg) => (
                <li
                  key={leg.id}
                  className="rounded-xl border border-[var(--line)] px-3 py-2"
                >
                  <p className="text-sm font-medium text-[var(--ink)]">
                    {leg.startLabel} → {leg.endLabel}
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {formatDistance(leg.distanceMeters)} ·{" "}
                    {formatDuration(leg.durationSeconds)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {selected.legs.some((l) => l.steps.length > 0) ? (
            <details className="rounded-xl border border-[var(--line)] px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
                Indicazioni stradali
              </summary>
              <ol className="mt-2 space-y-1.5 pl-4 text-xs text-[var(--ink-muted)]">
                {selected.legs.flatMap((leg) =>
                  leg.steps.map((step) => (
                    <li key={step.id} className="list-decimal">
                      {step.instruction}{" "}
                      <span className="text-[var(--ink-faint)]">
                        ({formatDistance(step.distanceMeters)})
                      </span>
                    </li>
                  )),
                )}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}

      {routeLimitations.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Limitazioni
          </p>
          {routeLimitations.map((l) => (
            <p
              key={l}
              className="text-[11px] leading-relaxed text-[var(--ink-muted)]"
            >
              • {l}
            </p>
          ))}
        </div>
      ) : null}

      <ShareActions
        mapsLink={mapsLink}
        copied={copied}
        onCopy={copyText}
        selected={selected}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function ShareActions({
  mapsLink,
  copied,
  onCopy,
  selected,
}: {
  mapsLink: ReturnType<typeof buildGoogleMapsDirectionsLink> | null;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
  selected: ReturnType<typeof useTripStore.getState>["routes"][number] | null;
}) {
  const trip = useTripStore((s) => s.trip);
  const persistTrip = useTripStore((s) => s.persistTrip);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);
  const setSelectedRoute = useTripStore((s) => s.setSelectedRoute);
  const [showPreview, setShowPreview] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  if (!trip.origin || !trip.destination) {
    return (
      <EmptyHint>
        Imposta partenza e destinazione per aprire o condividere il percorso.
      </EmptyHint>
    );
  }

  if (!mapsLink) return null;

  const stopsExport = exportStopsList({
    title: trip.meta.title,
    origin: trip.origin,
    destination: trip.destination,
    stops: trip.stops.map((s) => s.place),
  });

  const directions = selected
    ? exportDirectionsText(selected.legs)
    : "Nessuna indicazione: calcola prima un percorso reale.";

  return (
    <div className="space-y-3 border-t border-[var(--line)] pt-4">
      <SectionTitle
        title="Condivisione"
        subtitle="Apre Maps con partenza, arrivo e solo le tappe che hai inserito tu"
      />

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
        <p className="font-medium text-[var(--ink)]">Link Maps</p>
        <p>
          {mapsLink.preview.origin} → {mapsLink.preview.destination}
        </p>
        {trip.stops.length > 0 ? (
          <p>Tappe tue: {trip.stops.map((s) => s.place.label).join(" · ")}</p>
        ) : (
          <p>Nessuna tappa intermedia (solo A → B).</p>
        )}
        <p className="mt-1">
          Maps può ricalcolare il tracciato per traffico o variazioni del motore:
          le esclusioni Itinera (es. Evita Svizzera) non vengono trasferite nel
          link.
        </p>
      </div>

      {!showPreview ? (
        <Button
          type="button"
          className="w-full"
          onClick={() => setShowPreview(true)}
        >
          <ExternalLink className="h-4 w-4" />
          Rivedi e apri in Google Maps
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3">
          <p className="text-xs text-[var(--accent-ink)]">
            Confermi l’apertura? Solo partenza
            {trip.stops.length > 0 ? `, ${trip.stops.length} tappe` : ""} e
            arrivo — nessuna tappa inventata. Maps può comunque ricalcolare il
            percorso per traffico o per logica interna; le esclusioni
            personalizzate non saranno trasferite.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (selected) setSelectedRoute(selected.id);
                setActivePanel("itinerary");
                setMobilePanelOpen(true);
                setShowPreview(false);
              }}
            >
              Mostra sulla mappa
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => openMapsDirectionsUrl(mapsLink.url)}
            >
              <ExternalLink className="h-4 w-4" />
              Apri ora
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowPreview(false)}
            >
              Annulla
            </Button>
          </div>
        </div>
      )}

      {mapsLink.includedPreferences.length > 0 ? (
        <p className="text-[11px] text-[var(--ink-muted)]">
          Preferenze nel link: {mapsLink.includedPreferences.join(", ")}
        </p>
      ) : null}

      {mapsLink.omitted.length > 0 ? (
        <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
          {mapsLink.omitted.map((o) => (
            <p key={o}>• {o}</p>
          ))}
        </div>
      ) : null}

      {mapsLink.requiresSegmentation ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Il percorso completo richiede più segmenti di navigazione. Nessuna
          tappa viene eliminata: usa l’elenco tratte qui sotto.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopy("link", mapsLink.url)}
        >
          {copied === "link" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          Copia link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void nativeShare({
              title: trip.meta.title,
              text: `Itinerario Itinera: ${trip.origin?.label} → ${trip.destination?.label}`,
              url: mapsLink.url,
            }).then((r) => {
              if (r === "copied") onCopy("native", mapsLink.url);
            })
          }
        >
          <Share2 className="h-3.5 w-3.5" />
          Condividi
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopy("share", buildShareTripUrl(trip.meta.id))}
        >
          <Share2 className="h-3.5 w-3.5" />
          URL viaggio
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopy("stops", stopsExport)}
        >
          <FileText className="h-3.5 w-3.5" />
          Esporta tappe
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopy("directions", directions)}
        >
          <Route className="h-3.5 w-3.5" />
          Copia indicazioni
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void (async () => {
              await persistTrip();
              const repo = getTripRepository();
              if (!repo.createShare) return;
              const share = await repo.createShare(trip.meta.id);
              setShareToken(share.token);
              const url = `${window.location.origin}${share.urlPath}`;
              onCopy("public", url);
            })();
          }}
        >
          Link pubblico
        </Button>
      </div>

      {shareToken ? (
        <p className="text-[11px] text-[var(--ink-muted)]">
          Link pubblico creato (sola lettura):{" "}
          <code className="rounded bg-[var(--surface-2)] px-1">
            /share/{shareToken}
          </code>
        </p>
      ) : null}

      {mapsLink.segments && mapsLink.segments.length > 1 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Navigazione per tratta
          </p>
          {mapsLink.segments.map((seg) => (
            <button
              key={seg.url}
              type="button"
              onClick={() => openMapsDirectionsUrl(seg.url)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--brand)] hover:bg-[var(--brand-soft)]"
            >
              <Navigation className="h-3.5 w-3.5" />
              {seg.label}: {seg.from} → {seg.to}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
