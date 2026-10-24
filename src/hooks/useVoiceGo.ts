"use client";

import { useCallback, useRef, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import {
  isSpeechRecognitionSupported,
  listenOnce,
} from "@/lib/voice/speech-recognition";
import {
  runGoToDestination,
  type GoToResult,
  type GoToStatus,
} from "@/lib/voice/run-go-to";
import { speakNavigation } from "@/lib/navigation/voice";

export function useVoiceGo() {
  const setOrigin = useTripStore((s) => s.setOrigin);
  const setDestination = useTripStore((s) => s.setDestination);
  const clearStops = useTripStore((s) => s.clearStops);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);
  const { computeRoute } = useRouteCompute();
  const { locate, loading: gpsLoading, error: gpsError } = useCurrentLocation();

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState<GoToStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<GoToResult | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const busy =
    listening ||
    gpsLoading ||
    status === "locating" ||
    status === "resolving" ||
    status === "computing";

  const applyResult = useCallback(
    (result: GoToResult) => {
      setStatus(result.status);
      setMessage(result.message);
      setLastResult(result);
      if (result.status === "ready") {
        setActivePanel("summary");
        setMobilePanelOpen(true);
        speakNavigation(
          `Percorso verso ${result.destination?.label ?? "destinazione"} pronto. Scegli e avvia.`,
          true,
        );
      } else if (result.status === "error" && result.message) {
        speakNavigation(result.message, true);
      }
    },
    [setActivePanel, setMobilePanelOpen],
  );

  const goToQuery = useCallback(
    async (utteranceOrQuery: string) => {
      stopRef.current?.();
      stopRef.current = null;
      setListening(false);
      setInterim("");

      const result = await runGoToDestination(utteranceOrQuery, {
        locate,
        setOrigin,
        setDestination,
        clearStops,
        computeRoute: async () => {
          await computeRoute();
        },
        onStatus: (u) => {
          setStatus(u.status);
          setMessage(u.message);
          setLastResult(u);
        },
      });
      applyResult(result);
      return result;
    },
    [
      locate,
      setOrigin,
      setDestination,
      clearStops,
      computeRoute,
      applyResult,
    ],
  );

  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setStatus("error");
      setMessage(
        "Riconoscimento vocale non disponibile. Digita la destinazione oppure usa Chrome/Safari.",
      );
      return;
    }
    stopRef.current?.();
    setListening(true);
    setInterim("");
    setStatus("idle");
    setMessage("Ti ascolto… di’ «Portami in Via Gardenie a Rozzano»");
    speakNavigation("Dove vuoi andare?", true);

    stopRef.current = listenOnce({
      lang: "it-IT",
      onResult: (transcript, isFinal) => {
        setInterim(transcript);
        if (isFinal) {
          setListening(false);
          stopRef.current = null;
          void goToQuery(transcript);
        }
      },
      onError: (err) => {
        setListening(false);
        stopRef.current = null;
        setStatus("error");
        setMessage(err);
      },
      onEnd: () => {
        setListening(false);
      },
    }).stop;
  }, [goToQuery]);

  const stopListening = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  }, []);

  return {
    supported: isSpeechRecognitionSupported(),
    listening,
    interim,
    status,
    message: message ?? gpsError,
    lastResult,
    busy,
    startListening,
    stopListening,
    goToQuery,
  };
}
