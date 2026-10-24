export type SpeechRecognitionResultHandler = (transcript: string, isFinal: boolean) => void;

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: {
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string };
    }>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor():
  | (new () => BrowserSpeechRecognition)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

/**
 * One-shot Italian speech recognition (Chrome / Safari with permission).
 */
export function listenOnce(params: {
  lang?: string;
  onResult: SpeechRecognitionResultHandler;
  onError: (message: string) => void;
  onEnd?: () => void;
}): { stop: () => void } {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    params.onError(
      "Riconoscimento vocale non supportato su questo browser. Usa Chrome o Safari aggiornato.",
    );
    return { stop: () => undefined };
  }

  const rec = new Ctor();
  rec.lang = params.lang ?? "it-IT";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let stopped = false;

  rec.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    if (!last) return;
    const transcript = last[0]?.transcript?.trim() ?? "";
    if (!transcript) return;
    params.onResult(transcript, Boolean(last.isFinal));
  };

  rec.onerror = (event) => {
    if (stopped) return;
    const code = event.error;
    if (code === "aborted" || code === "no-speech") {
      params.onError(
        code === "no-speech"
          ? "Non ho sentito nulla. Riprova."
          : "Ascolto interrotto.",
      );
      return;
    }
    if (code === "not-allowed") {
      params.onError(
        "Microfono bloccato. Consenti l’accesso al microfono per Itinera.",
      );
      return;
    }
    params.onError(`Errore riconoscimento vocale (${code}).`);
  };

  rec.onend = () => {
    params.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    params.onError("Impossibile avviare il microfono.");
  }

  return {
    stop: () => {
      stopped = true;
      try {
        rec.abort();
      } catch {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
    },
  };
}
