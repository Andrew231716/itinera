"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, SectionTitle } from "@/components/ui/primitives";

type Service = {
  id: string;
  label: string;
  status: "ready" | "missing" | "partial" | "optional";
  message: string;
  envVars: string[];
};

type HealthPayload = {
  ok: boolean;
  probed: boolean;
  isLiveCapable: boolean;
  readiness?: {
    services: Service[];
    nextSteps: string[];
  };
  probes?: Record<string, { ok: boolean; detail: string; skipped?: boolean }>;
};

export function SetupPanel() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(probe = false) {
    setError(null);
    if (probe) setProbing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/health${probe ? "?probe=1" : ""}`);
      const json = (await res.json()) as HealthPayload;
      setData(json);
    } catch {
      setError("Impossibile leggere lo stato dei servizi.");
    } finally {
      setLoading(false);
      setProbing(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  const services = data?.readiness?.services ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Passa a modalità reale"
        subtitle="Serve configurare le chiavi API — senza di esse resta la demo onesta"
      />

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Lettura configurazione…
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {data ? (
        <div
          className={`rounded-xl border px-3 py-3 text-sm ${
            data.isLiveCapable
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {data.isLiveCapable ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {data.isLiveCapable
              ? "Pronto per routing e mappa live"
              : "Modalità demo attiva — configurazione incompleta"}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {services.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-medium text-[var(--ink)]">{s.label}</p>
              <Badge
                tone={
                  s.status === "ready"
                    ? "ok"
                    : s.status === "missing"
                      ? "warn"
                      : "neutral"
                }
              >
                {s.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{s.message}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
              {s.envVars.join(" · ")}
            </p>
            {data?.probes?.[
              s.id === "google_server" ? "google" : s.id
            ] ? (
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                Probe:{" "}
                {
                  data.probes[s.id === "google_server" ? "google" : s.id]
                    ?.detail
                }
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {data?.readiness?.nextSteps?.length ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Prossimi passi
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-[var(--ink-muted)]">
            {data.readiness.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void load(false)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Aggiorna stato
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void load(true)}
          disabled={probing}
        >
          {probing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Verifica connettività
        </Button>
      </div>

      <div className="rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[11px] leading-relaxed text-[var(--ink-muted)]">
        <p className="font-semibold text-[var(--ink)]">File locale</p>
        <p className="mt-1">
          Copia <code>.env.example</code> in <code>.env.local</code>, inserisci
          le chiavi, riavvia il server. Non committare mai <code>.env.local</code>.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--ink)]/90 p-2 text-[10px] text-white">
{`cp .env.example .env.local
# edita .env.local
npm run dev`}
        </pre>
      </div>
    </div>
  );
}
