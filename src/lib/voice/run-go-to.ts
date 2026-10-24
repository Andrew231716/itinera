import type { PlaceRef } from "@/lib/types/trip";
import { extractGoDestination } from "@/lib/voice/go-command";

export type GoToStatus =
  | "idle"
  | "locating"
  | "resolving"
  | "computing"
  | "ready"
  | "error";

export interface GoToResult {
  status: GoToStatus;
  query: string | null;
  destination: PlaceRef | null;
  origin: PlaceRef | null;
  message: string | null;
  candidates: PlaceRef[];
}

async function resolveDestinationQuery(
  query: string,
): Promise<{ place: PlaceRef | null; candidates: PlaceRef[] }> {
  const auto = await fetch(
    `/api/places/autocomplete?q=${encodeURIComponent(query)}`,
  );
  const autoData = (await auto.json()) as {
    suggestions?: Array<{ placeId: string; label: string; secondary?: string }>;
    error?: string;
  };
  if (!auto.ok || !autoData.suggestions?.length) {
    return { place: null, candidates: [] };
  }

  const top = autoData.suggestions.slice(0, 4);
  const candidates: PlaceRef[] = [];

  for (const s of top) {
    const det = await fetch(
      `/api/places/details?placeId=${encodeURIComponent(s.placeId)}`,
    );
    const detData = (await det.json()) as { place?: PlaceRef; error?: string };
    if (det.ok && detData.place) {
      candidates.push({ ...detData.place, source: "places" });
    }
  }

  return { place: candidates[0] ?? null, candidates };
}

export type GoToDeps = {
  locate: () => Promise<PlaceRef | null>;
  setOrigin: (place: PlaceRef) => void;
  setDestination: (place: PlaceRef) => void;
  clearStops?: () => void;
  computeRoute: () => Promise<void>;
  onStatus?: (update: GoToResult) => void;
};

/**
 * GPS origin → resolve destination from utterance/query → compute routes.
 * Caller then shows the summary so the user picks a route and starts nav.
 */
export async function runGoToDestination(
  utteranceOrQuery: string,
  deps: GoToDeps,
): Promise<GoToResult> {
  const emit = (partial: GoToResult) => {
    deps.onStatus?.(partial);
    return partial;
  };

  const query =
    extractGoDestination(utteranceOrQuery) ?? utteranceOrQuery.trim();
  if (!query || query.length < 3) {
    return emit({
      status: "error",
      query: null,
      destination: null,
      origin: null,
      message: "Non ho capito la destinazione. Prova: «Portami in Via Gardenie a Rozzano».",
      candidates: [],
    });
  }

  emit({
    status: "locating",
    query,
    destination: null,
    origin: null,
    message: "Rilevamento posizione…",
    candidates: [],
  });

  const origin = await deps.locate();
  if (!origin) {
    return emit({
      status: "error",
      query,
      destination: null,
      origin: null,
      message: "Serve la posizione GPS come partenza.",
      candidates: [],
    });
  }
  deps.setOrigin(origin);

  emit({
    status: "resolving",
    query,
    destination: null,
    origin,
    message: `Cerco «${query}»…`,
    candidates: [],
  });

  const { place, candidates } = await resolveDestinationQuery(query);
  if (!place) {
    return emit({
      status: "error",
      query,
      destination: null,
      origin,
      message: `Nessun luogo trovato per «${query}».`,
      candidates: [],
    });
  }

  deps.clearStops?.();
  deps.setDestination(place);

  emit({
    status: "computing",
    query,
    destination: place,
    origin,
    message: `Calcolo percorso verso ${place.label}…`,
    candidates,
  });

  try {
    await deps.computeRoute();
  } catch {
    return emit({
      status: "error",
      query,
      destination: place,
      origin,
      message: "Calcolo percorso non riuscito.",
      candidates,
    });
  }

  return emit({
    status: "ready",
    query,
    destination: place,
    origin,
    message: `Percorsi pronti per ${place.label}. Scegli quello da seguire e avvia la navigazione.`,
    candidates,
  });
}
