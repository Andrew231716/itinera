"use client";

import { useTripStore } from "@/lib/store/trip-store";
import { Badge } from "@/components/ui/primitives";

export function StatusBanner() {
  const mapsMode = useTripStore((s) => s.mapsMode);
  const routeMode = useTripStore((s) => s.routeMode);
  const routeError = useTripStore((s) => s.routeError);
  const routes = useTripStore((s) => s.routes);
  const trip = useTripStore((s) => s.trip);

  const selected =
    routes.find((r) => r.id === trip.selectedRouteId) ?? routes[0] ?? null;

  return (
    <div
      className="pointer-events-none absolute top-3 right-3 z-20 flex max-w-[min(280px,70vw)] flex-col items-end gap-1.5"
      aria-live="polite"
    >
      {(mapsMode === "demo" || routeMode === "demo") && (
        <Badge tone="demo">Modalità demo</Badge>
      )}
      {mapsMode === "live" && routeMode !== "demo" && (
        <Badge tone="ok">Maps live</Badge>
      )}
      {routeMode === "loading" && <Badge tone="brand">Calcolo in corso</Badge>}
      {routeMode === "error" && <Badge tone="warn">Errore temporaneo</Badge>}
      {routeMode === "idle" && !trip.origin && (
        <Badge>Configura partenza</Badge>
      )}
      {routeMode === "live" && routes.length === 0 && (
        <Badge tone="warn">Nessun percorso</Badge>
      )}
      {routeMode === "live" && selected?.isConformant === false && (
        <Badge tone="warn">Vincolo violato</Badge>
      )}
      {routeMode === "live" &&
        selected?.unverifiableConstraints &&
        selected.unverifiableConstraints.length > 0 && (
          <Badge tone="demo">Vincolo non verificabile</Badge>
        )}
      {routeMode === "live" && selected?.isConformant === true && (
        <Badge tone="ok">Percorso disponibile</Badge>
      )}
      {routeError ? (
        <span className="rounded-lg bg-red-50 px-2 py-1 text-[10px] text-red-700 shadow-sm">
          {routeError}
        </span>
      ) : null}
    </div>
  );
}
