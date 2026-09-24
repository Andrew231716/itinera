import type { ComputedRoute, TollInfo } from "@/lib/types/route";
import type { LatLng } from "@/lib/types/trip";
import {
  fetchMichelinRouteTolls,
  type MichelinRouteTolls,
  type MichelinTollsResult,
} from "./tolls-client";

function relativeDistanceDelta(
  googleMeters: number,
  michelinMeters: number | undefined,
): number {
  if (!michelinMeters || michelinMeters <= 0 || googleMeters <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(googleMeters - michelinMeters) / googleMeters;
}

/** Prefer Michelin route with closest distance; fall back to first. */
export function matchMichelinRoute(
  googleDistanceMeters: number,
  michelinRoutes: MichelinRouteTolls[],
): MichelinRouteTolls | null {
  if (michelinRoutes.length === 0) return null;

  let best = michelinRoutes[0];
  let bestDelta = relativeDistanceDelta(
    googleDistanceMeters,
    best.distanceMeters,
  );

  for (let i = 1; i < michelinRoutes.length; i++) {
    const candidate = michelinRoutes[i];
    const delta = relativeDistanceDelta(
      googleDistanceMeters,
      candidate.distanceMeters,
    );
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }

  // Loose match: still useful as a parallel estimate even when geometries differ.
  return best;
}

function buildMichelinNotes(route: MichelinRouteTolls): string {
  const parts: string[] = [];
  if (route.summary) parts.push(`Percorso ViaMichelin: ${route.summary}`);
  if (route.barriers.length > 0) {
    const detail = route.barriers
      .map((b) =>
        b.cost
          ? `${b.name} (${b.cost.amount.toFixed(2)} ${b.cost.currencyCode})`
          : b.name,
      )
      .join(", ");
    parts.push(`Caselli: ${detail}`);
  }
  if (route.vignettes.length > 0) {
    const detail = route.vignettes
      .map((v) => {
        const price = v.cost
          ? ` ${v.cost.amount.toFixed(2)} ${v.cost.currencyCode}`
          : "";
        return `${v.name}${price}`;
      })
      .join("; ");
    parts.push(`Vignette / pedaggi urbani: ${detail}`);
  }
  parts.push(
    "Stima indipendente ViaMichelin (può riferirsi a un’alternativa diversa da Google).",
  );
  return parts.join(" · ");
}

export function attachMichelinToTollInfo(
  existing: TollInfo | undefined,
  matched: MichelinRouteTolls,
): TollInfo {
  const tollAmount = matched.tolls?.amount;
  const hasMichelinTolls =
    (tollAmount != null && tollAmount > 0) || matched.barriers.length > 0;

  const michelinBlock = {
    estimatedPrice: tollAmount,
    currencyCode: matched.tolls?.currencyCode ?? "EUR",
    barriers: matched.barriers.map((b) => ({
      name: b.name,
      amount: b.cost?.amount,
      currencyCode: b.cost?.currencyCode,
    })),
    vignettes: matched.vignettes.map((v) => ({
      name: v.name,
      amount: v.cost?.amount,
      currencyCode: v.cost?.currencyCode,
      message: v.message ?? undefined,
    })),
    matchedSummary: matched.summary,
    distanceMeters: matched.distanceMeters,
    notes: buildMichelinNotes(matched),
  };

  if (!existing) {
    return {
      hasTolls: hasMichelinTolls,
      estimatedPrice: undefined,
      currencyCode: michelinBlock.currencyCode,
      source: hasMichelinTolls ? "michelin" : undefined,
      notes: hasMichelinTolls
        ? "Pedaggi da ViaMichelin (Google non ha restituito un importo)."
        : undefined,
      michelin: michelinBlock,
    };
  }

  return {
    ...existing,
    hasTolls: existing.hasTolls || hasMichelinTolls,
    source:
      existing.source === "google_routes" && hasMichelinTolls
        ? "combined"
        : existing.source ?? (hasMichelinTolls ? "michelin" : undefined),
    michelin: michelinBlock,
  };
}

export function enrichRoutesWithMichelinTolls(
  routes: ComputedRoute[],
  michelin: MichelinTollsResult | null,
): ComputedRoute[] {
  if (!michelin || michelin.routes.length === 0) return routes;

  return routes.map((route) => {
    const matched = matchMichelinRoute(route.distanceMeters, michelin.routes);
    if (!matched) return route;
    return {
      ...route,
      tolls: attachMichelinToTollInfo(route.tolls, matched),
    };
  });
}

export async function enrichComputedRoutesWithMichelin(options: {
  routes: ComputedRoute[];
  points: LatLng[];
  departureName?: string;
  arrivalName?: string;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}): Promise<{ routes: ComputedRoute[]; limitation?: string }> {
  if (options.routes.length === 0 || options.points.length < 2) {
    return { routes: options.routes };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const michelin = await fetchMichelinRouteTolls({
      points: options.points,
      departureName: options.departureName,
      arrivalName: options.arrivalName,
      avoidTolls: options.avoidTolls,
      avoidHighways: options.avoidHighways,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!michelin || michelin.routes.length === 0) {
      return {
        routes: options.routes,
        limitation:
          "Stima pedaggi ViaMichelin non disponibile in questo momento.",
      };
    }

    return {
      routes: enrichRoutesWithMichelinTolls(options.routes, michelin),
      limitation:
        "Pedaggi arricchiti con stima ViaMichelin (fonte indipendente dal percorso Google).",
    };
  } catch {
    return {
      routes: options.routes,
      limitation:
        "Stima pedaggi ViaMichelin non disponibile in questo momento.",
    };
  }
}
