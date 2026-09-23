"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { TripDraft } from "@/lib/types/trip";
import { useTripStore } from "@/lib/store/trip-store";
import { Button } from "@/components/ui/primitives";
import Link from "next/link";

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "local">("loading");
  const [message, setMessage] = useState("");
  const [trip, setTrip] = useState<TripDraft | null>(null);
  const loadTrip = useTripStore((s) => s.loadTrip);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      // Try cloud first
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.trip) {
          setTrip(data.trip);
          setStatus("ok");
          return;
        }
        if (data.mode === "local_only") {
          // Fallback: local snapshot on same browser
          const raw = localStorage.getItem(`itinera.share.snapshot.${token}`);
          if (raw) {
            setTrip(JSON.parse(raw) as TripDraft);
            setStatus("local");
            return;
          }
          setStatus("error");
          setMessage(data.message ?? "Condivisione non disponibile.");
          return;
        }
        setStatus("error");
        setMessage(data.error ?? "Link non valido.");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Errore di rete.");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-4 bg-[var(--mist)] px-4 py-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
        Itinera
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        Viaggio condiviso
      </h1>
      {status === "loading" ? (
        <p className="text-sm text-[var(--ink-muted)]">Caricamento…</p>
      ) : null}
      {status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          {message || "Link inesistente, scaduto o revocato."}
        </p>
      ) : null}
      {(status === "ok" || status === "local") && trip ? (
        <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          {status === "local" ? (
            <p className="text-xs text-sky-800">
              Aperto da snapshot locale (sola lettura su questo dispositivo).
            </p>
          ) : (
            <p className="text-xs text-emerald-800">
              Sola lettura — non puoi modificare il viaggio originale.
            </p>
          )}
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {trip.meta.title}
          </h2>
          <p className="text-sm text-[var(--ink-muted)]">
            {trip.origin?.label ?? "?"} → {trip.destination?.label ?? "?"}
          </p>
          {trip.stops.length > 0 ? (
            <ul className="text-xs text-[var(--ink-muted)]">
              {trip.stops.map((s, i) => (
                <li key={s.id}>
                  Tappa {i + 1}: {s.place.label}
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              loadTrip({
                ...structuredClone(trip),
                meta: {
                  ...trip.meta,
                  id: crypto.randomUUID(),
                  title: `${trip.meta.title} (da link)`,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              });
              window.location.href = "/";
            }}
          >
            Apri una copia modificabile
          </Button>
        </div>
      ) : null}
      <Link href="/" className="text-sm text-[var(--brand)] hover:underline">
        Torna a Itinera
      </Link>
    </main>
  );
}
