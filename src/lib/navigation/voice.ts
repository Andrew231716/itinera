/** Speak a navigation cue in Italian (best-effort Web Speech API). */
export function speakNavigation(text: string, enabled: boolean): void {
  if (!enabled || typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "it-IT";
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore — voice is optional.
  }
}

export function stopNavigationSpeech(): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
