"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  EmptyHint,
  SectionTitle,
  TextArea,
} from "@/components/ui/primitives";
import type { AssistantParseResult } from "@/lib/ai/assistant";

export function NaturalLanguageAssistant() {
  const [utterance, setUtterance] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistantParseResult | null>(null);

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/assistant/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterance }),
      });
      const data = (await res.json()) as AssistantParseResult;
      setResult(data);
    } catch {
      setResult({
        status: "unavailable",
        limitations: ["Impossibile contattare l’assistente."],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Assistente"
        subtitle="Interpreta il linguaggio naturale — non inventa percorsi"
      />

      <TextArea
        rows={5}
        placeholder='Es. “Parti da Rozzano, arriva a Roma passando da Firenze. Evita i pedaggi e non attraversare Bologna…”'
        value={utterance}
        onChange={(e) => setUtterance(e.target.value)}
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
          Fase 6 predisposta. Con <code>OPENAI_API_KEY</code> l’assistente
          tradurrà la richiesta in parametri strutturati; il routing resta a
          carico di Google Routes.
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
    </div>
  );
}
