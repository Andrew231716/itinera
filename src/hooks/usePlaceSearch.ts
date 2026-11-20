"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const sequence = useRef(0);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      sequence.current++;
    },
    [],
  );

  const search = useCallback((value: string) => {
    const request = ++sequence.current;
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
        if (request !== sequence.current) return;
        if (!res.ok) {
          setError(data.error ?? "Ricerca non disponibile.");
          setSuggestions([]);
          return;
        }
        setMode(data.mode);
        setSuggestions(data.suggestions ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (request !== sequence.current) return;
        setError("Errore di rete durante la ricerca.");
        setSuggestions([]);
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    }, 280);
  }, []);

  const resolvePlace = useCallback(
    async (suggestion: PlaceSuggestion): Promise<PlaceRef | null> => {
      const request = ++sequence.current;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
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
        if (request !== sequence.current) return null;
        if (!res.ok) {
          setError(data.error ?? "Dettagli località non disponibili.");
          return null;
        }
        return data.place as PlaceRef;
      } catch {
        if (request !== sequence.current) return null;
        setError("Impossibile risolvere la località.");
        return null;
      } finally {
        if (request === sequence.current) {
          setLoading(false);
          setSuggestions([]);
        }
      }
    },
    [],
  );

  const clear = useCallback(() => {
    sequence.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    setLoading(false);
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
