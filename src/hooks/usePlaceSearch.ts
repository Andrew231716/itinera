"use client";

import { useCallback, useRef, useState } from "react";
import type { PlaceSuggestion } from "@/lib/types/route";
import type { PlaceRef } from "@/lib/types/trip";

export function usePlaceSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "demo" | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((value: string) => {
    setQuery(value);
    setError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    if (value.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(value.trim())}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Ricerca non disponibile.");
          setSuggestions([]);
          return;
        }
        setMode(data.mode);
        setSuggestions(data.suggestions ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Errore di rete durante la ricerca.");
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, []);

  const resolvePlace = useCallback(
    async (suggestion: PlaceSuggestion): Promise<PlaceRef | null> => {
      setLoading(true);
      setError(null);
      try {
        if (suggestion.location && suggestion.source === "demo") {
          return {
            id: suggestion.placeId,
            label: suggestion.primaryText,
            address: suggestion.fullText,
            placeId: suggestion.placeId,
            location: suggestion.location,
            source: "demo",
          };
        }
        const res = await fetch(
          `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Dettagli località non disponibili.");
          return null;
        }
        return data.place as PlaceRef;
      } catch {
        setError("Impossibile risolvere la località.");
        return null;
      } finally {
        setLoading(false);
        setSuggestions([]);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setQuery("");
    setSuggestions([]);
    setError(null);
  }, []);

  return {
    query,
    suggestions,
    loading,
    error,
    mode,
    search,
    resolvePlace,
    clear,
    setQuery,
  };
}
