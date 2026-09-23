"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import type { PlaceRef } from "@/lib/types/trip";
import { Button, Input, Label, cn } from "@/components/ui/primitives";

interface PlaceSearchProps {
  label: string;
  placeholder?: string;
  value: PlaceRef | null;
  onSelect: (place: PlaceRef) => void;
  onClear?: () => void;
  onPickFromMap?: () => void;
  pickingFromMap?: boolean;
}

export function PlaceSearch({
  label,
  placeholder = "Cerca città o indirizzo…",
  value,
  onSelect,
  onClear,
  onPickFromMap,
  pickingFromMap,
}: PlaceSearchProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    query,
    suggestions,
    loading,
    error,
    mode,
    search,
    resolvePlace,
    clear,
    setQuery,
  } = usePlaceSearch();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) setQuery(value.label);
  }, [value, setQuery]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handlePick(suggestion: (typeof suggestions)[number]) {
    const place = await resolvePlace(suggestion);
    if (place) {
      onSelect(place);
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label className="mb-0">{label}</Label>
        {onPickFromMap ? (
          <button
            type="button"
            onClick={onPickFromMap}
            className={cn(
              "text-[11px] font-medium transition",
              pickingFromMap
                ? "text-[var(--accent)]"
                : "text-[var(--brand)] hover:underline",
            )}
          >
            {pickingFromMap ? "Tocca la mappa…" : "Seleziona sulla mappa"}
          </button>
        ) : null}
      </div>
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
        <Input
          value={query}
          placeholder={placeholder}
          className="pr-9 pl-9"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          onChange={(e) => {
            search(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {loading ? (
          <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--ink-faint)]" />
        ) : value || query ? (
          <button
            type="button"
            aria-label="Cancella"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1 text-[var(--ink-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            onClick={() => {
              clear();
              onClear?.();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : null}

      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-56 w-full overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] py-1 shadow-[0_12px_40px_rgba(36,52,71,0.12)] animate-[fadeSlide_180ms_ease]"
        >
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                onClick={() => handlePick(s)}
              >
                <span className="text-sm font-medium text-[var(--ink)]">
                  {s.primaryText}
                </span>
                {s.secondaryText ? (
                  <span className="text-xs text-[var(--ink-muted)]">
                    {s.secondaryText}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {mode === "demo" ? (
            <li className="border-t border-[var(--line)] px-3 py-2 text-[10px] text-[var(--ink-muted)]">
              Suggerimenti demo — configura Google Places per risultati reali
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export function MapPickHint({
  active,
  onCancel,
}: {
  active: boolean;
  onCancel: () => void;
}) {
  if (!active) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent-ink)] animate-[fadeSlide_180ms_ease]">
      <span>Clicca sulla mappa per scegliere il punto.</span>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Annulla
      </Button>
    </div>
  );
}
