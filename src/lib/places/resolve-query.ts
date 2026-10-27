import type { PlaceRef } from "@/lib/types/trip";
import type { PlaceSuggestion } from "@/lib/types/route";

/**
 * Resolve a free-text address/place to a PlaceRef via autocomplete + details.
 * Uses the first suggestion (best match).
 */
export async function resolvePlaceQuery(
  query: string,
): Promise<{ place: PlaceRef | null; error?: string }> {
  const q = query.trim();
  if (q.length < 2) {
    return { place: null, error: "Indirizzo troppo corto." };
  }

  try {
    const autoRes = await fetch(
      `/api/places/autocomplete?q=${encodeURIComponent(q)}`,
    );
    const autoData = (await autoRes.json()) as {
      suggestions?: PlaceSuggestion[];
      error?: string;
    };
    if (!autoRes.ok) {
      return {
        place: null,
        error: autoData.error ?? `Impossibile cercare «${q}».`,
      };
    }
    const first = autoData.suggestions?.[0];
    if (!first) {
      return { place: null, error: `Nessun risultato per «${q}».` };
    }

    if (first.location && first.source === "demo") {
      return {
        place: {
          id: first.placeId,
          label: first.primaryText,
          address: first.fullText,
          placeId: first.placeId,
          location: first.location,
          source: "demo",
        },
      };
    }

    const detailsRes = await fetch(
      `/api/places/details?placeId=${encodeURIComponent(first.placeId)}`,
    );
    const detailsData = (await detailsRes.json()) as {
      place?: PlaceRef;
      error?: string;
    };
    if (!detailsRes.ok || !detailsData.place) {
      return {
        place: null,
        error: detailsData.error ?? `Dettagli non disponibili per «${q}».`,
      };
    }
    return { place: detailsData.place };
  } catch {
    return { place: null, error: `Errore di rete per «${q}».` };
  }
}

export function parseAddressLines(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}
