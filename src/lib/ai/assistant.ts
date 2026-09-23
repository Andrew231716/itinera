import type { PlaceRef, RoadPreferences, CustomExclusion } from "@/lib/types/trip";

/**
 * Structured output expected from the NL assistant (Phase 6).
 * The AI interprets; routing engine computes — never invent cartographic data.
 */
export interface AssistantParseResult {
  status: "ok" | "needs_clarification" | "unavailable";
  originText?: string;
  destinationText?: string;
  stopTexts?: string[];
  preferences?: Partial<RoadPreferences>;
  hardExclusions?: Array<{ kind: CustomExclusion["kind"]; label: string }>;
  softPreferencesNotes?: string[];
  clarificationQuestions?: string[];
  limitations: string[];
  /** Places resolved only via Places API / user confirmation — never invented */
  resolvedOrigin?: PlaceRef;
  resolvedDestination?: PlaceRef;
  resolvedStops?: PlaceRef[];
}

export interface AssistantParseRequest {
  utterance: string;
  locale?: string;
}

/**
 * Phase 6 scaffold. Without OPENAI_API_KEY returns a deterministic stub
 * that does not invent coordinates or routes.
 */
export async function parseNaturalLanguageRequest(
  request: AssistantParseRequest,
  openAiKey: string | undefined,
): Promise<AssistantParseResult> {
  const utterance = request.utterance.trim();
  if (!utterance) {
    return {
      status: "needs_clarification",
      clarificationQuestions: ["Scrivi la tua richiesta di viaggio."],
      limitations: [],
    };
  }

  if (!openAiKey) {
    return {
      status: "unavailable",
      limitations: [
        "Assistente IA non configurato (manca OPENAI_API_KEY).",
        "L’IA interpreterà solo la richiesta; il motore di routing calcolerà il percorso.",
        "Nessuna strada, coordinata o distanza viene inventata da questo modulo.",
      ],
      clarificationQuestions: [
        "Configura OPENAI_API_KEY oppure usa i campi del pannello per definire partenza, arrivo e tappe.",
      ],
    };
  }

  // Live OpenAI integration will be completed in Phase 6.
  return {
    status: "unavailable",
    limitations: [
      "Integrazione OpenAI predisposta ma non ancora attiva (Fase 6).",
      "Usa il form strutturato per creare il viaggio.",
    ],
  };
}
