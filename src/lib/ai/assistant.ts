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
  /** Location text for a parking search request (e.g. "parcheggi a Como") */
  parkingSearchText: z.string().nullable(),
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
  /** If set, open parking search near this resolved place */
  parkingSearchText?: string | null;
  resolvedParkingSearch?: PlaceRef | null;
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
    parkingSearch?: PlaceRef | null;
  };
}

export interface AssistantParseRequest {
  utterance: string;
  locale?: string;
  /** Snapshot of the trip already on screen — for «percorso attuale» edits */
  tripContext?: {
    originLabel?: string | null;
    destinationLabel?: string | null;
    stopLabels?: string[];
    exclusionLabels?: string[];
  };
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
      parkingSearchText: { type: ["string", "null"] },
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
      "parkingSearchText",
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
    parkingSearchText: { type: "STRING", nullable: true },
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
    "parkingSearchText",
  ],
} as const;

const SYSTEM_PROMPT = `Sei il parser di Itinera, un pianificatore di percorsi.
Estrai SOLO parametri strutturati dalla richiesta dell'utente in italiano.
NON inventare coordinate, place id, strade, distanze, tempi, pedaggi o disponibilità.
NON calcolare percorsi.
Se una località è ambigua, status=needs_clarification e poni domande.
Se la richiesta è impossibile (es. destinazione assente e non deducibile), status=impossible.
Se chiede funzioni non supportate (es. evitare tunnel in modo garantito), elenca in unsupportedRequests e usa status=unsupported o ok con caveat.
Distingui hardExclusions (obbligatorie, es. "non attraversare Bologna", "evita Chiasso", "evita Lugano", "evita la Svizzera") da preferences (soft).
Se l'utente parla del "percorso attuale" / "itinerario attuale" e nel contesto sono già presenti partenza e arrivo, lascia originText e destinationText a null e applica solo le modifiche richieste (esclusioni, preferenze, tappe aggiuntive).
maxExtraMinutes: converti "un'ora" in 60, "mezz'ora" in 30, ecc.
travelMode default null se non specificato.
Per Paesi (Svizzera/Switzerland/CH/Suisse/Schweiz) usa hardExclusions kind=geo_zone con label "Svizzera" (o il nome del paese).
Per dogane/valichi: usa hardExclusions kind=city o address con il nome del luogo (es. "Chiasso", "dogana di Chiasso").
Se chiede parcheggi / sosta / garage / EasyPark in una zona (es. "cerca parcheggi a Como", "dove parcheggio vicino al Duomo"), imposta parkingSearchText con la località da cercare e status=ok. Non inventare elenchi di parcheggi: Itinera li cercherà con fonti reali.`;

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
    let detail = `OpenAI HTTP ${res.status}.`;
    if (res.status === 429) {
      detail =
        "OpenAI senza credito o in rate-limit (HTTP 429). Gemini resta il provider gratuito principale.";
    }
    return {
      ok: false,
      provider: "openai",
      detail,
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

function geminiModelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const defaults = [
    "gemini-3.6-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];
  const ordered = preferred
    ? [preferred, ...defaults.filter((m) => m !== preferred)]
    : defaults;
  return [...new Set(ordered)];
}

function isGeminiCapacityError(status: number, detail: string): boolean {
  if (status === 429) return true;
  return /high demand|try again later|resource.?exhausted|unavailable|overloaded|quota/i.test(
    detail,
  );
}

function buildUserPrompt(
  utterance: string,
  tripContext?: AssistantParseRequest["tripContext"],
): string {
  if (!tripContext) return utterance;
  const lines = [
    "Contesto viaggio già impostato nell'app (non inventare altro):",
    `- Partenza: ${tripContext.originLabel ?? "(non impostata)"}`,
    `- Arrivo: ${tripContext.destinationLabel ?? "(non impostata)"}`,
    `- Tappe: ${(tripContext.stopLabels ?? []).join(", ") || "(nessuna)"}`,
    `- Esclusioni già presenti: ${(tripContext.exclusionLabels ?? []).join(", ") || "(nessuna)"}`,
    "",
    "Richiesta utente:",
    utterance,
  ];
  return lines.join("\n");
}

async function fetchFromGeminiModel(
  utterance: string,
  geminiKey: string,
  model: string,
): Promise<StructuredFetch> {
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
    let detail = `Gemini (${model}) HTTP ${res.status}.`;
    try {
      const errBody = (await res.json()) as {
        error?: { message?: string };
      };
      if (errBody.error?.message) {
        detail = `Gemini (${model}): ${errBody.error.message}`;
      }
    } catch {
      /* keep status detail */
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
    return {
      ok: false,
      provider: "gemini",
      detail: `Gemini (${model}): risposta vuota.`,
    };
  }
  return parseStructuredJson(content, "gemini");
}

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

  const models = geminiModelCandidates();
  const attempts: string[] = [];

  for (const model of models) {
    const result = await fetchFromGeminiModel(utterance, geminiKey, model);
    if (result.ok) {
      geminiSkippedUntil = 0;
      return result;
    }

    attempts.push(result.detail);
    const capacity = isGeminiCapacityError(0, result.detail) ||
      /HTTP 429|high demand|try again later|resource.?exhausted|overloaded/i.test(
        result.detail,
      );

    const needsEnable =
      /not been used|disabled|not enabled|PERMISSION_DENIED|API key not valid|blocked|API_KEY_SERVICE_BLOCKED/i.test(
        result.detail,
      );
    if (needsEnable) {
      geminiSkippedUntil = Date.now() + 10 * 60 * 1000;
      const source = getGeminiKeySource();
      const detail =
        source === "maps_server"
          ? /blocked|API_KEY_SERVICE_BLOCKED/i.test(result.detail)
            ? "Gemini: la chiave server blocca Generative Language API. Google Cloud → Credentials → chiave Itinera server → API restrictions → aggiungi «Generative Language API» → Save. Nessuna nuova chiave."
            : `Gemini non ancora attivo sul progetto Google già usato per Maps. Abilita Generative Language API (gratis): ${GEMINI_ENABLE_API_URL} — poi, se la chiave server ha restrizioni API, aggiungi anche «Generative Language API». Nessuna nuova chiave da creare.`
          : `Gemini rifiutato (API disabilitata o chiave non valida). ${result.detail}`;
      return { ok: false, provider: "gemini", detail };
    }

    // Capacity / model unavailable → try next model
    if (
      capacity ||
      /no longer available|not found|is not found|NOT_FOUND/i.test(result.detail)
    ) {
      continue;
    }

    // Other hard errors: stop the chain
    return result;
  }

  return {
    ok: false,
    provider: "gemini",
    detail:
      attempts[attempts.length - 1] ??
      "Gemini non disponibile (tutti i modelli in coda o saturi). Riprova tra poco.",
  };
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
  prompt: string,
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
        ? await fetchFromOpenAi(prompt, openAiKey!)
        : await fetchFromGemini(prompt, geminiKey!);
    if (result.ok) return result;
    attempts.push(result.detail);
  }

  return {
    ok: false,
    detail: "Nessun provider IA disponibile al momento.",
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

  let resolvedParkingSearch: PlaceRef | null = null;
  if (structured.parkingSearchText?.trim()) {
    resolvedParkingSearch = await resolvePlaceText(
      structured.parkingSearchText.trim(),
    );
    if (!resolvedParkingSearch) {
      unresolvedPlaces.push(structured.parkingSearchText.trim());
    }
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
    parkingSearchText: structured.parkingSearchText,
    limitations,
    provider,
    resolvedOrigin,
    resolvedDestination,
    resolvedStops,
    resolvedParkingSearch,
    unresolvedPlaces: [],
    preview: {
      origin: resolvedOrigin,
      destination: resolvedDestination,
      stops: resolvedStops,
      preferences,
      exclusions: structured.hardExclusions,
      travelMode: structured.travelMode,
      title: structured.titleSuggestion,
      parkingSearch: resolvedParkingSearch,
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

  const prompt = buildUserPrompt(utterance, request.tripContext);
  const fetched = await fetchStructuredFromProviders(prompt);
  if (!fetched.ok) {
    const attempts =
      "attempts" in fetched && fetched.attempts.length > 0
        ? fetched.attempts
        : [];
    const keysMissing = !getGeminiKey() && !getOpenAiKey();
    const capacity =
      attempts.some((a) =>
        /high demand|try again later|429|rate-limit|senza credito/i.test(a),
      ) || /non disponibile al momento/i.test(fetched.detail);

    return {
      status: "unavailable",
      limitations: [
        fetched.detail,
        ...attempts.slice(0, 4),
        "L’IA interpreterà solo la richiesta; il motore di routing calcolerà il percorso.",
        "Nessuna strada, coordinata o distanza viene inventata da questo modulo.",
      ],
      clarificationQuestions: [
        keysMissing
          ? "Configura GEMINI_API_KEY (gratuita) e/o OPENAI_API_KEY, oppure usa i campi del pannello."
          : capacity
            ? "I provider IA sono momentaneamente saturi o senza credito. Riprova tra poco, oppure imposta esclusione/preferenze dal pannello Itinerario."
            : "Riprova tra poco oppure usa i campi del pannello per partenza, arrivo ed esclusioni.",
      ],
    };
  }

  return buildResultFromStructured(fetched.structured, fetched.provider);
}
