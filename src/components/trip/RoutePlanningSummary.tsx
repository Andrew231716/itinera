"use client";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { travelPlan, tollEstimate } from "@/lib/routing/planning";
import type { ComputedRoute } from "@/lib/types/route";
import { Button } from "@/components/ui/primitives";
import { formatCurrency, formatDuration } from "@/lib/utils/format";

export function alternativeDifference(
  route: ComputedRoute,
  reference: ComputedRoute,
): string {
  const minutes = Math.round(
    (route.durationSeconds - reference.durationSeconds) / 60,
  );
  const ownTolls = tollEstimate(route),
    baseTolls = tollEstimate(reference);
  const difference =
    ownTolls && baseTolls && ownTolls.currency === baseTolls.currency
      ? ownTolls.amount - baseTolls.amount
      : null;
  return [
    minutes ? `${minutes > 0 ? "+" : ""}${minutes} min` : "Stesso tempo",
    difference !== null && difference !== 0
      ? `${difference > 0 ? "+" : "−"}${formatCurrency(Math.abs(difference), ownTolls!.currency)} pedaggi stimati`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function RoutePlanningSummary({ route }: { route: ComputedRoute }) {
  const trip = useTripStore((s) => s.trip);
  const routeMode = useTripStore((s) => s.routeMode);
  const { computeRoute } = useRouteCompute();
  const plan = travelPlan(trip, route);
  return (
    <section className="workspace-card space-y-2">
      <h3 className="text-lg font-semibold">Il viaggio in breve</h3>
      <p className="text-2xl font-semibold">
        {formatDuration(plan.durationSeconds)}{" "}
        <span className="text-sm font-normal text-[var(--ink-muted)]">
          {plan.stopsSeconds ? "con le soste" : "di percorso"}
        </span>
      </p>
      {plan.stopsSeconds > 0 && (
        <p className="text-sm text-[var(--ink-muted)]">
          {formatDuration(route.durationSeconds)} in viaggio ·{" "}
          {formatDuration(plan.stopsSeconds)} di soste
        </p>
      )}
      {plan.fuel !== null && (
        <p className="text-sm">
          Carburante stimato <strong>{formatCurrency(plan.fuel, "EUR")}</strong>
          {plan.total !== null && (
            <>
              {" "}
              · Totale con pedaggi{" "}
              <strong>{formatCurrency(plan.total, "EUR")}</strong>
            </>
          )}
        </p>
      )}
      {plan.fuel !== null && (
        <p className="text-xs text-[var(--ink-muted)]">
          Calcolato con i tuoi consumi.{" "}
          {plan.tolls === null
            ? "Pedaggi non disponibili, totale incompleto."
            : "Pedaggi e consumi possono variare."}
        </p>
      )}
      {plan.departure && (
        <div className="border-t border-[var(--line)] pt-2">
          <p className="text-sm">
            Partenza consigliata{" "}
            <strong>
              {new Date(plan.departure).toLocaleString("it-IT", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
          </p>
          <p className="mb-2 text-xs text-[var(--ink-muted)]">
            Stima basata sul percorso attuale e sulle soste. Ricalcola con
            questo orario per aggiornare il traffico previsto.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={routeMode === "loading"}
            onClick={() => {
              useTripStore.getState().setDepartureAt(plan.departure);
              void computeRoute();
            }}
          >
            Usa questa partenza e ricalcola
          </Button>
        </div>
      )}
    </section>
  );
}
