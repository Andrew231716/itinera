import { z } from "zod";
import type { PlaceRef, RoadPreferences, CustomExclusion, TravelMode } from "@/lib/types/trip";
import {
  autocompletePlaces,
  fetchPlaceDetails,
} from "@/lib/google/places-client";
import {
  getGeminiKey,
  getGeminiKeySource,
  getOpenAiKey,
  getServerGoogleMapsKey,
  GEMINI_ENABLE_API_URL,
} from "@/lib/config/env";

/**
 * Structured output expected from the NL assistant.
 * The AI interprets; routing engine computes — never invent cartographic data.
 */
export const AssistantStructuredSchema = z.object({
  status: z.enum(["ok", "needs_clarification", "impossible", "unsupported"]),
  originText: z.string().nullable(),
  destinationText: z.string().nullable(),
  stopTexts: z.array(z.string()),
  travelMode: z
    .enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"])
    .nullable(),
  preferences: z.object({
    avoidTolls: z.boolean().nullable(),
    avoidHighways: z.boolean().nullable(),
    avoidFerries: z.boolean().nullable(),
    avoidTunnels: z.boolean().nullable(),
    preferFastest: z.boolean().nullable(),
    preferShortest: z.boolean().nullable(),
    preferScenic: z.boolean().nullable(),
    maxExtraMinutes: z.number().nullable(),
  }),
  hardExclusions: z.array(
    z.object({
      kind: z.enum(["city", "address", "road", "road_segment", "geo_zone"]),
      label: z.string(),
    }),
  ),
  softNotes: z.array(z.string()),
  clarificationQuestions: z.array(z.string()),
  unsupportedRequests: z.array(z.string()),
  reorderStops: z.boolean(),
  titleSuggestion: z.string().nullable(),
});

export type AssistantStructured = z.infer<typeof AssistantStructuredSchema>;

export type AssistantProviderId = "openai" | "gemini";

export interface AssistantParseResult {
  status: "ok" | "needs_clarification" | "unavailable" | "impossible" | "unsupported";
  originText?: string;
  destinationText?: string;
  stopTexts?: string[];
  travelMode?: TravelMode | null;
  preferences?: Partial<RoadPreferences>;
  hardExclusions?: Array<{ kind: CustomExclusion["kind"]; label: string }>;
  softPreferencesNotes?: string[];
  clarificationQuestions?: string[];
  unsupportedRequests?: string[];
  reorderStops?: boolean;
  titleSuggestion?: string | null;
  limitations: string[];
  /** Places resolved only via Places API — never invented by the model */
  resolvedOrigin?: PlaceRef | null;
  resolvedDestination?: PlaceRef | null;
  resolvedStops?: PlaceRef[];
  unresolvedPlaces?: string[];
  /** Which model provider produced the structured parse */
  provider?: AssistantProviderId;
  /** Preview patch for user confirmation before store mutation */
  preview?: {
    origin?: PlaceRef | null;
    destination?: PlaceRef | null;
    stops?: PlaceRef[];
    preferences?: Partial<RoadPreferences>;
    exclusions?: Array<{ kind: CustomExclusion["kind"]; label: string }>;
    travelMode?: TravelMode | null;
    title?: string | null;
  };
}

export interface AssistantParseRequest {
  utterance: string;
  locale?: string;
}

const OPENAI_JSON_SCHEMA = {
  name: "itinera_trip_parse",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: {
        type: "string",
        enum: ["ok", "needs_clarification", "impossible", "unsupported"],
      },
      originText: { type: ["string", "null"] },
      destinationText: { type: ["string", "null"] },
      stopTexts: { type: "array", items: { type: "string" } },
      travelMode: {
        type: ["string", "null"],
        enum: ["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER", null],
      },
      preferences: {
        type: "object",
        additionalProperties: false,
        properties: {
          avoidTolls: { type: ["boolean", "null"] },
          avoidHighways: { type: ["boolean", "null"] },
          avoidFerries: { type: ["boolean", "null"] },
          avoidTunnels: { type: ["boolean", "null"] },
          preferFastest: { type: ["boolean", "null"] },
          preferShortest: { type: ["boolean", "null"] },
          preferScenic: { type: ["boolean", "null"] },
          maxExtraMinutes: { type: ["number", "null"] },
        },
        required: [
          "avoidTolls",
          "avoidHighways",
          "avoidFerries",
          "avoidTunnels",
          "preferFastest",
          "preferShortest",
          "preferScenic",
          "maxExtraMinutes",
        ],
      },
      hardExclusions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: {
              type: "string",
              enum: ["city", "address", "road", "road_segment", "geo_zone"],
            },
            label: { type: "string" },
          },
          required: ["kind", "label"],
        },
      },
      softNotes: { type: "array", items: { type: "string" } },
      clarificationQuestions: { type: "array", items: { type: "string" } },
      unsupportedRequests: { type: "array", items: { type: "string" } },
      reorderStops: { type: "boolean" },
      titleSuggestion: { type: ["string", "null"] },
    },
    required: [
      "status",
      "originText",
      "destinationText",
      "stopTexts",
      "travelMode",
      "preferences",
      "hardExclusions",
      "softNotes",
      "clarificationQuestions",
      "unsupportedRequests",
      "reorderStops",
      "titleSuggestion",
    ],
  },
} as const;

/** Gemini Schema (nullable instead of union types). */
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: {
      type: "STRING",
      enum: ["ok", "needs_clarification", "impossible", "unsupported"],
    },
    originText: { type: "STRING", nullable: true },
    destinationText: { type: "STRING", nullable: true },
    stopTexts: { type: "ARRAY", items: { type: "STRING" } },
    travelMode: {
      type: "STRING",
      nullable: true,
      enum: ["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"],
    },
    preferences: {
      type: "OBJECT",
      properties: {
        avoidTolls: { type: "BOOLEAN", nullable: true },
        avoidHighways: { type: "BOOLEAN", nullable: true },
        avoidFerries: { type: "BOOLEAN", nullable: true },
        avoidTunnels: { type: "BOOLEAN", nullable: true },
        preferFastest: { type: "BOOLEAN", nullable: true },
        preferShortest: { type: "BOOLEAN", nullable: true },
        preferScenic: { type: "BOOLEAN", nullable: true },
        maxExtraMinutes: { type: "NUMBER", nullable: true },
      },
      required: [
        "avoidTolls",
        "avoidHighways",
        "avoidFerries",
        "avoidTunnels",
        "preferFastest",
        "preferShortest",
        "preferScenic",
        "maxExtraMinutes",
      ],
    },
    hardExclusions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: {
            type: "STRING",
            enum: ["city", "address", "road", "road_segment", "geo_zone"],
          },
          label: { type: "STRING" },
        },
        required: ["kind", "label"],
      },
    },
    softNotes: { type: "ARRAY", items: { type: "STRING" } },
    clarificationQuestions: { type: "ARRAY", items: { type: "STRING" } },
    unsupportedRequests: { type: "ARRAY", items: { type: "STRING" } },
    reorderStops: { type: "BOOLEAN" },
    titleSuggestion: { type: "STRING", nullable: true },
  },
  required: [
    "status",
    "originText",
    "destinationText",
    "stopTexts",
    "travelMode",
    "preferences",
    "hardExclusions",
    "softNotes",
    "clarificationQuestions",
    "unsupportedRequests",
    "reorderStops",
    "titleSuggestion",
  ],
} as const;

const SYSTEM_PROMPT = `Sei il parser di Itinera, un pianificatore di percorsi.
Estrai SOLO parametri strutturati dalla richiesta dell'utente in italiano.
NON inventare coordinate, place id, strade, distanze, tempi, pedaggi o disponibilità.
NON calcolare percorsi.
Se una località è ambigua, status=needs_clarification e poni domande.
Se la richiesta è impossibile (es. destinazione assente e non deducibile), status=impossible.
Se chiede funzioni non supportate (es. evitare tunnel in modo garantito), elenca in unsupportedRequests e usa status=unsupported o ok con caveat.
Distingui hardExclusions (obbligatorie, es. "non attraversare Bologna") da preferences (soft).
maxExtraMinutes: converti "un'ora" in 60, "mezz'ora" in 30, ecc.
travelMode default null se non specificato.`;

type StructuredFetch =
  | { ok: true; structured: AssistantStructured; provider: AssistantProviderId }
  | { ok: false; provider: AssistantProviderId; detail: string };

async function resolvePlaceText(text: string): Promise<PlaceRef | null> {
  const apiKey = getServerGoogleMapsKey();
  const { suggestions } = await autocompletePlaces(text, apiKey);
  if (suggestions.length === 0) return null;
  if (suggestions.length > 1) {
    const exact = suggestions.find(
      (s) => s.primaryText.toLowerCase() === text.trim().toLowerCase(),
    );
    const chosen = exact ?? suggestions[0];
    const details = await fetchPlaceDetails(chosen.placeId, apiKey);
    return { ...details.place, source: "assistant" };
  }
  const details = await fetchPlaceDetails(suggestions[0].placeId, apiKey);
  return { ...details.place, source: "assistant" };
}

function prefsFromStructured(
  p: AssistantStructured["preferences"],
): Partial<RoadPreferences> {
  const out: Partial<RoadPreferences> = {};
  if (p.avoidTolls != null) out.avoidTolls = p.avoidTolls;
  if (p.avoidHighways != null) out.avoidHighways = p.avoidHighways;
  if (p.avoidFerries != null) out.avoidFerries = p.avoidFerries;
  if (p.avoidTunnels != null) out.avoidTunnels = p.avoidTunnels;
  if (p.preferFastest != null) out.preferFastest = p.preferFastest;
  if (p.preferShortest != null) out.preferShortest = p.preferShortest;
  if (p.preferScenic != null) out.preferScenic = p.preferScenic;
  if (p.maxExtraMinutes != null) out.maxExtraMinutes = p.maxExtraMinutes;
  return out;
}

function parseStructuredJson(
  content: string,
  provider: AssistantProviderId,
): StructuredFetch {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    return {
      ok: false,
      provider,
      detail: `JSON non valido dalla risposta ${provider}.`,
    };
  }

  const validated = AssistantStructuredSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      ok: false,
      provider,
      detail: `Schema strutturato non valido da ${provider}.`,
    };
  }
  return { ok: true, structured: validated.data, provider };
}

async function fetchFromOpenAi(
  utterance: string,
  openAiKey: string,
): Promise<StructuredFetch> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: utterance },
      ],
      response_format: {
        type: "json_schema",
        json_schema: OPENAI_JSON_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      provider: "openai",
      detail: `OpenAI HTTP ${res.status}. Verifica chiave e credito.`,
    };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return { ok: false, provider: "openai", detail: "Risposta OpenAI vuota." };
  }
  return parseStructuredJson(content, "openai");
}

/** Skip Gemini for a while after project-level 403 (API not enabled). */
let geminiSkippedUntil = 0;

async function fetchFromGemini(
  utterance: string,
  geminiKey: string,
): Promise<StructuredFetch> {
  if (geminiSkippedUntil > Date.now()) {
    return {
      ok: false,
      provider: "gemini",
      detail:
        "Gemini temporaneamente saltato (API non abilitata o chiave non autorizzata). Riprovo più tardi.",
    };
  }

  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: utterance }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    let detail = `Gemini HTTP ${res.status}.`;
    try {
      const errBody = (await res.json()) as {
        error?: { message?: string };
      };
      if (errBody.error?.message) detail = `Gemini: ${errBody.error.message}`;
    } catch {
      /* keep status detail */
    }

    const needsEnable =
      res.status === 403 &&
      /not been used|disabled|not enabled|PERMISSION_DENIED|API key not valid/i.test(
        detail,
      );
    if (needsEnable) {
      // Avoid hammering Gemini on every parse when the project API is off.
      geminiSkippedUntil = Date.now() + 10 * 60 * 1000;
      const source = getGeminiKeySource();
      if (source === "maps_server") {
        detail = `Gemini non ancora attivo sul progetto Google già usato per Maps. Abilita Generative Language API (gratis): ${GEMINI_ENABLE_API_URL} — poi, se la chiave server ha restrizioni API, aggiungi anche «Generative Language API». Nessuna nuova chiave da creare.`;
      } else {
        detail = `Gemini rifiutato (API disabilitata o chiave non valida). ${detail}`;
      }
    }

    return { ok: false, provider: "gemini", detail };
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const content = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!content) {
    return { ok: false, provider: "gemini", detail: "Risposta Gemini vuota." };
  }
  // Success — clear any previous skip window
  geminiSkippedUntil = 0;
  return parseStructuredJson(content, "gemini");
}

function providerOrder(): AssistantProviderId[] {
  const pref = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (pref === "openai") return ["openai", "gemini"];
  if (pref === "gemini") return ["gemini", "openai"];
  // auto: prefer free Gemini when a key is resolvable
  if (getGeminiKey()) return ["gemini", "openai"];
  return ["openai", "gemini"];
}

async function fetchStructuredFromProviders(
  utterance: string,
): Promise<StructuredFetch | { ok: false; detail: string; attempts: string[] }> {
  const openAiKey = getOpenAiKey();
  const geminiKey = getGeminiKey();
  const order = providerOrder().filter((id) =>
    id === "openai" ? Boolean(openAiKey) : Boolean(geminiKey),
  );

  if (order.length === 0) {
    return {
      ok: false,
      detail:
        "Assistente IA non configurato (nessuna chiave Google/OpenAI).",
      attempts: [],
    };
  }

  const attempts: string[] = [];
  for (const id of order) {
    const result =
      id === "openai"
        ? await fetchFromOpenAi(utterance, openAiKey!)
        : await fetchFromGemini(utterance, geminiKey!);
    if (result.ok) return result;
    attempts.push(result.detail);
  }

  return {
    ok: false,
    detail: "Nessun provider IA disponibile.",
    attempts,
  };
}

async function buildResultFromStructured(
  structured: AssistantStructured,
  provider: AssistantProviderId,
): Promise<AssistantParseResult> {
  const limitations: string[] = [
    `Interpretato con ${provider === "gemini" ? "Gemini (gratuito)" : "OpenAI"}. Il percorso va calcolato dal motore di routing.`,
    ...structured.unsupportedRequests.map((u) => `Non supportato: ${u}`),
    ...structured.softNotes,
  ];

  if (structured.status === "needs_clarification") {
    return {
      status: "needs_clarification",
      clarificationQuestions: structured.clarificationQuestions,
      limitations,
      provider,
      originText: structured.originText ?? undefined,
      destinationText: structured.destinationText ?? undefined,
      stopTexts: structured.stopTexts,
    };
  }

  if (structured.status === "impossible") {
    return {
      status: "impossible",
      clarificationQuestions: structured.clarificationQuestions,
      limitations,
      provider,
    };
  }

  const unresolvedPlaces: string[] = [];
  let resolvedOrigin: PlaceRef | null = null;
  let resolvedDestination: PlaceRef | null = null;
  const resolvedStops: PlaceRef[] = [];

  if (structured.originText) {
    resolvedOrigin = await resolvePlaceText(structured.originText);
    if (!resolvedOrigin) unresolvedPlaces.push(structured.originText);
  }
  if (structured.destinationText) {
    resolvedDestination = await resolvePlaceText(structured.destinationText);
    if (!resolvedDestination) unresolvedPlaces.push(structured.destinationText);
  }
  for (const stop of structured.stopTexts) {
    const place = await resolvePlaceText(stop);
    if (place) resolvedStops.push(place);
    else unresolvedPlaces.push(stop);
  }

  for (const ex of structured.hardExclusions) {
    if (!ex.label.trim()) unresolvedPlaces.push("(esclusione senza nome)");
  }

  if (unresolvedPlaces.length > 0) {
    return {
      status: "needs_clarification",
      clarificationQuestions: [
        `Non riesco a risolvere in modo verificabile: ${unresolvedPlaces.join(", ")}. Specifica meglio o seleziona dalla ricerca.`,
      ],
      limitations,
      provider,
      unresolvedPlaces,
      originText: structured.originText ?? undefined,
      destinationText: structured.destinationText ?? undefined,
      stopTexts: structured.stopTexts,
    };
  }

  const preferences = prefsFromStructured(structured.preferences);

  return {
    status: structured.status === "unsupported" ? "unsupported" : "ok",
    originText: structured.originText ?? undefined,
    destinationText: structured.destinationText ?? undefined,
    stopTexts: structured.stopTexts,
    travelMode: structured.travelMode,
    preferences,
    hardExclusions: structured.hardExclusions,
    softPreferencesNotes: structured.softNotes,
    clarificationQuestions: structured.clarificationQuestions,
    unsupportedRequests: structured.unsupportedRequests,
    reorderStops: structured.reorderStops,
    titleSuggestion: structured.titleSuggestion,
    limitations,
    provider,
    resolvedOrigin,
    resolvedDestination,
    resolvedStops,
    unresolvedPlaces: [],
    preview: {
      origin: resolvedOrigin,
      destination: resolvedDestination,
      stops: resolvedStops,
      preferences,
      exclusions: structured.hardExclusions,
      travelMode: structured.travelMode,
      title: structured.titleSuggestion,
    },
  };
}

export async function parseNaturalLanguageRequest(
  request: AssistantParseRequest,
): Promise<AssistantParseResult> {
  const utterance = request.utterance.trim();
  if (!utterance) {
    return {
      status: "needs_clarification",
      clarificationQuestions: ["Scrivi la tua richiesta di viaggio."],
      limitations: [],
    };
  }

  const fetched = await fetchStructuredFromProviders(utterance);
  if (!fetched.ok) {
    const attempts =
      "attempts" in fetched && fetched.attempts.length > 0
        ? fetched.attempts
        : [];
    return {
      status: "unavailable",
      limitations: [
        fetched.detail,
        ...attempts,
        "L’IA interpreterà solo la richiesta; il motore di routing calcolerà il percorso.",
        "Nessuna strada, coordinata o distanza viene inventata da questo modulo.",
      ],
      clarificationQuestions: [
        "Configura GEMINI_API_KEY (gratuita) e/o OPENAI_API_KEY, oppure usa i campi del pannello.",
      ],
    };
  }

  return buildResultFromStructured(fetched.structured, fetched.provider);
}
