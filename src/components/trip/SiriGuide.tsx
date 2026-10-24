"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Mic, Smartphone } from "lucide-react";
import { Button, SectionTitle } from "@/components/ui/primitives";

const EXAMPLE_DEST = "Via Gardenie Rozzano";

function useAppOrigin(): string {
  const [origin, setOrigin] = useState("https://itinera-psi.vercel.app");
  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.origin) {
      setOrigin(window.location.origin);
    }
  }, []);
  return origin;
}

function CopyRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all text-[11px] text-[var(--ink)]">
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            } catch {
              // ignore
            }
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copiato" : "Copia"}
        </Button>
      </div>
    </div>
  );
}

/**
 * In-app guide: set up Siri / Scorciatoie to open Itinera with a destination.
 */
export function SiriGuide({ compact = false }: { compact?: boolean }) {
  const origin = useAppOrigin();
  const fixedUrl = useMemo(
    () => `${origin}/?go=${encodeURIComponent(EXAMPLE_DEST)}`,
    [origin],
  );
  const goPath = useMemo(
    () => `${origin}/go?q=${encodeURIComponent(EXAMPLE_DEST)}`,
    [origin],
  );
  const templateUrl = `${origin}/?go=`;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact ? (
        <SectionTitle
          title="Hey Siri + Itinera"
          subtitle="Collega Siri con l’app Scorciatoie (iPhone). La PWA non può registrare frasi Siri da sola."
        />
      ) : (
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-[var(--brand)]" />
          <p className="text-sm font-semibold text-[var(--ink)]">
            Guida Siri / Scorciatoie
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--brand)]/25 bg-[var(--brand-soft)]/40 px-3 py-3 text-sm text-[var(--ink)]">
        <p className="font-medium">Cosa otterrai</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          «Hey Siri, naviga con Itinera» → si apre Itinera, prende il GPS e
          calcola i percorsi verso la destinazione. Poi scegli il percorso e
          avvia.
        </p>
      </div>

      <ol className="list-decimal space-y-2.5 pl-4 text-sm text-[var(--ink)]">
        <li>
          Apri l’app <strong>Scorciatoie</strong> su iPhone.
        </li>
        <li>
          Tocca <strong>+</strong> → aggiungi l’azione{" "}
          <strong>Apri URL</strong>.
        </li>
        <li>
          Nell’URL incolla uno dei link qui sotto (o{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 text-[11px]">
            {templateUrl}
          </code>{" "}
          + destinazione).
        </li>
        <li>
          (Consigliato) Prima di Apri URL aggiungi{" "}
          <strong>Chiedi ogni volta</strong> / «Dove vuoi andare?» e usa la
          risposta nell’URL dopo{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 text-[11px]">
            ?go=
          </code>
          .
        </li>
        <li>
          Menu ⋯ → <strong>Aggiungi a Siri</strong> → frase tipo{" "}
          <em>«Naviga con Itinera»</em> o{" "}
          <em>«Portami … con Itinera»</em>.
        </li>
        <li>
          Prova: <em>«Hey Siri, naviga con Itinera»</em>.
        </li>
      </ol>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
          Link da copiare
        </p>
        <CopyRow
          label={`Esempio fisso · ${EXAMPLE_DEST}`}
          value={fixedUrl}
        />
        <CopyRow label="Formato corto /go" value={goPath} />
        <CopyRow label="Prefisso (aggiungi tu la destinazione)" value={templateUrl} />
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--ink-muted)]">
        <p className="flex items-start gap-2">
          <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
          <span>
            In app puoi anche toccare il <strong>microfono</strong> e dire
            «Portami in Via Gardenie a Rozzano» senza passare da Siri.
          </span>
        </p>
      </div>
    </div>
  );
}
