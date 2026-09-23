"use client";

import { useState } from "react";
import { Loader2, Sparkles, Check, X } from "lucide-react";
import { nanoid } from "nanoid";
import {
  Badge,
  Button,
  EmptyHint,
  SectionTitle,
  TextArea,
} from "@/components/ui/primitives";
import type { AssistantParseResult } from "@/lib/ai/assistant";
import { useTripStore } from "@/lib/store/trip-store";
import type { PointExclusion } from "@/lib/types/trip";
import { useRouteCompute } from "@/hooks/useRouteCompute";

export function NaturalLanguageAssistant() {
  const [utterance, setUtterance] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistantParseResult | null>(null);
  const [pending, setPending] = useState<AssistantParseResult | null>(null);

  const setOrigin = useTripStore((s) => s.setOrigin);
  const setDestination = useTripStore((s) => s.setDestination);
  const clearStops = useTripStore((s) => s.clearStops);
  const addStop = useTripStore((s) => s.addStop);
  const setPreferences = useTripStore((s) => s.setPreferences);
  const addExclusion = useTripStore((s) => s.addExclusion);
  const setTravelMode = useTripStore((s) => s.setTravelMode);
  const setTitle = useTripStore((s) => s.setTitle);
  const { computeRoute } = useRouteCompute();

  async function submit() {
    setLoading(true);
    setResult(null);
    setPending(null);
    try {
      const res = await fetch("/api/assistant/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterance }),
      });
      const data = (await res.json()) as AssistantParseResult;
      setResult(data);
      if (data.status === "ok" || data.status === "unsupported") {
        if (data.preview) setPending(data);
      }
    } catch {
      setResult({
        status: "unavailable",
        limitations: ["Impossibile contattare l’assistente."],
      });
    } finally {
      setLoading(false);
    }
  }

  function cancelPreview() {
    setPending(null);
  }

  async function confirmPreview() {
    if (!pending?.preview) return;
    const p = pending.preview;

    if (p.title) setTitle(p.title);
    if (p.origin) setOrigin(p.origin);
    if (p.destination) setDestination(p.destination);
    if (p.stops?.length) {
      clearStops();
      p.stops.forEach((place) => addStop(place));
    }
    if (p.preferences) setPreferences(p.preferences);
    if (p.travelMode) setTravelMode(p.travelMode);
    if (p.exclusions?.length) {
      for (const ex of p.exclusions) {
        // Resolve exclusion place via Places if we have matching stop/origin labels later;
        // for now create a labeled hard exclusion without coords until user picks —
        // Better: try to resolve from preview resolved places list
        const match =
          pending.resolvedStops?.find((s) =>
            s.label.toLowerCase().includes(ex.label.toLowerCase()),
          ) ??
          (pending.resolvedOrigin?.label
            .toLowerCase()
            .includes(ex.label.toLowerCase())
            ? pending.resolvedOrigin
            : null) ??
          (pending.resolvedDestination?.label
            .toLowerCase()
            .includes(ex.label.toLowerCase())
            ? pending.resolvedDestination
            : null);

        // Fetch exclusion place through a quick client resolve
        let place = match ?? null;
        if (!place) {
          try {
            const ac = await fetch(
              `/api/places/autocomplete?q=${encodeURIComponent(ex.label)}`,
            );
            const acData = await ac.json();
            const first = acData.suggestions?.[0];
            if (first) {
              const det = await fetch(
                `/api/places/details?placeId=${encodeURIComponent(first.placeId)}`,
              );
              const detData = await det.json();
              place = detData.place ?? null;
            }
          } catch {
            place = null;
          }
        }

        if (place) {
          const exclusion: PointExclusion = {
            id: nanoid(),
            kind: ex.kind === "geo_zone" || ex.kind === "road_segment" ? "city" : ex.kind,
            label: ex.label,
            strength: "hard",
            place,
            radiusMeters: ex.kind === "city" ? 5000 : 800,
            createdAt: new Date().toISOString(),
          };
          addExclusion(exclusion);
        }
      }
    }

    setPending(null);
    await computeRoute();
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Assistente"
        subtitle="Interpreta il linguaggio naturale — conferma prima di applicare"
      />

      <TextArea
        rows={5}
        placeholder='Es. “Parti da Rozzano, arriva a Roma passando da Firenze. Evita i pedaggi e non attraversare Bologna…”'
        value={utterance}
        onChange={(e) => setUtterance(e.target.value)}
        aria-label="Richiesta in linguaggio naturale"
      />

      <Button
        type="button"
        className="w-full"
        onClick={submit}
        disabled={loading || utterance.trim().length < 4}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Interpreta richiesta
      </Button>

      {!result ? (
        <EmptyHint>
          Con <code>OPENAI_API_KEY</code> l’assistente traduce la richiesta in
          parametri strutturati. Le località sono risolte via Places. Il trip
          store si aggiorna solo dopo la tua conferma.
        </EmptyHint>
      ) : (
        <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <Badge
            tone={
              result.status === "ok"
                ? "ok"
                : result.status === "needs_clarification"
                  ? "warn"
                  : "demo"
            }
          >
            {result.status}
          </Badge>
          {result.clarificationQuestions?.map((q) => (
            <p key={q} className="text-sm text-[var(--ink)]">
              {q}
            </p>
          ))}
          {result.limitations.map((l) => (
            <p key={l} className="text-xs text-[var(--ink-muted)]">
              • {l}
            </p>
          ))}
        </div>
      )}

      {pending?.preview ? (
        <div
          className="space-y-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand-soft)]/40 p-3 animate-[fadeSlide_180ms_ease]"
          role="region"
          aria-label="Anteprima modifiche assistente"
        >
          <p className="text-sm font-semibold text-[var(--ink)]">
            Anteprima — conferma per applicare
          </p>
          <ul className="space-y-1 text-xs text-[var(--ink-muted)]">
            {pending.preview.origin ? (
              <li>Partenza: {pending.preview.origin.label}</li>
            ) : null}
            {pending.preview.destination ? (
              <li>Arrivo: {pending.preview.destination.label}</li>
            ) : null}
            {pending.preview.stops?.map((s, i) => (
              <li key={s.id}>
                Tappa {i + 1}: {s.label}
              </li>
            ))}
            {pending.preview.exclusions?.map((e) => (
              <li key={e.label}>Esclusione hard: {e.label}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void confirmPreview()}>
              <Check className="h-3.5 w-3.5" />
              Conferma e calcola
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancelPreview}>
              <X className="h-3.5 w-3.5" />
              Annulla
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
