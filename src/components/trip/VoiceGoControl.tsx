"use client";

import { useEffect, useRef } from "react";
import { Loader2, Mic, MicOff, X } from "lucide-react";
import { useVoiceGo } from "@/hooks/useVoiceGo";
import { useTripStore } from "@/lib/store/trip-store";
import { Button, cn } from "@/components/ui/primitives";

/**
 * Floating mic — Google Maps–style “Portami a…” for the web navigator.
 * Also handles deep links / Siri Shortcuts: ?go=… & ?voice=…
 */
export function VoiceGoControl() {
  const navigation = useTripStore((s) => s.navigation);
  const driving =
    navigation.status === "navigating" ||
    navigation.status === "off_route" ||
    navigation.status === "starting" ||
    navigation.status === "arrived";

  const {
    supported,
    listening,
    interim,
    status,
    message,
    busy,
    startListening,
    stopListening,
    goToQuery,
    lastResult,
  } = useVoiceGo();

  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current) return;
    const params = new URLSearchParams(window.location.search);
    const go =
      params.get("go")?.trim() ||
      params.get("q")?.trim() ||
      params.get("voice")?.trim() ||
      params.get("destinazione")?.trim();
    if (!go) return;
    deepLinkDone.current = true;
    void (async () => {
      await goToQuery(go);
      const url = new URL(window.location.href);
      ["go", "q", "voice", "destinazione", "siri"].forEach((k) =>
        url.searchParams.delete(k),
      );
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    })();
  }, [goToQuery]);

  if (driving) return null;

  const showPanel =
    listening ||
    busy ||
    status === "error" ||
    status === "ready" ||
    Boolean(interim);

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-40 flex flex-col items-end gap-2",
        "right-3 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))]",
        "landscape:bottom-3 landscape:right-[max(0.75rem,env(safe-area-inset-right))]",
        "max-lg:landscape:bottom-3",
      )}
    >
      {showPanel ? (
        <div className="pointer-events-auto w-[min(20rem,calc(100vw-5.5rem))] rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 p-3 text-sm shadow-lg backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-[var(--ink)]">
              {listening
                ? "Ti ascolto…"
                : status === "ready"
                  ? "Percorsi pronti"
                  : status === "error"
                    ? "Comando vocale"
                    : "Preparazione…"}
            </p>
            <button
              type="button"
              className="rounded-lg p-1 text-[var(--ink-faint)] hover:bg-[var(--surface-2)]"
              aria-label="Chiudi"
              onClick={stopListening}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {interim ? (
            <p className="mt-1 text-[var(--brand)] italic">«{interim}»</p>
          ) : null}
          {message ? (
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{message}</p>
          ) : null}
          {status === "ready" && lastResult?.destination ? (
            <p className="mt-2 text-xs text-[var(--ink)]">
              Destinazione:{" "}
              <span className="font-medium">{lastResult.destination.label}</span>
              . Apri Riepilogo, scegli il percorso e avvia.
            </p>
          ) : null}
          {!supported ? (
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              Microfono non supportato qui. Puoi aprire Itinera con{" "}
              <code className="rounded bg-[var(--surface-2)] px-1">
                ?go=Via+Gardenie+Rozzano
              </code>{" "}
              (anche da un comando Siri / Dscorciatoia).
            </p>
          ) : null}
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        className={cn(
          "pointer-events-auto h-14 w-14 rounded-full p-0 shadow-lg",
          listening && "animate-pulse bg-red-600 hover:bg-red-700",
        )}
        aria-label={
          listening ? "Interrompi ascolto" : "Comando vocale: portami a…"
        }
        title="Di’ «Portami in Via Gardenie a Rozzano»"
        disabled={busy && !listening}
        onClick={() => {
          if (listening) stopListening();
          else startListening();
        }}
      >
        {busy && !listening ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : listening ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
}
