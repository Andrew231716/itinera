import { z } from "zod";
import type { PlaceRef, RoadPreferences, CustomExclusion, TravelMode } from "@/lib/types/trip";
import {
  autocompletePlaces,
  fetchPlaceDetails,
} from "@/lib/google/places-client";
import { getServerGoogleMapsKey } from "@/lib/config/env";

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

const JSON_SCHEMA = {
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

async function resolvePlaceText(text: string): Promise<PlaceRef | null> {
  const apiKey = getServerGoogleMapsKey();
  const { suggestions } = await autocompletePlaces(text, apiKey);
  if (suggestions.length === 0) return null;
  if (suggestions.length > 1) {
    // Prefer exact primary match; still return top if clearly matching
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
        json_schema: JSON_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    return {
      status: "unavailable",
      limitations: [
        "OpenAI API non disponibile o rifiutata. Nessuna modifica applicata al viaggio.",
      ],
    };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return {
      status: "unavailable",
      limitations: ["Risposta OpenAI vuota."],
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    return {
      status: "unavailable",
      limitations: ["JSON non valido dalla risposta OpenAI."],
    };
  }

  const validated = AssistantStructuredSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      status: "unavailable",
      limitations: ["Schema strutturato non valido. Nessuna modifica applicata."],
    };
  }

  const structured = validated.data;
  const limitations: string[] = [
    "L’assistente ha solo interpretato la richiesta. Il percorso va calcolato dal motore di routing.",
    ...structured.unsupportedRequests.map((u) => `Non supportato: ${u}`),
    ...structured.softNotes,
  ];

  if (structured.status === "needs_clarification") {
    return {
      status: "needs_clarification",
      clarificationQuestions: structured.clarificationQuestions,
      limitations,
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
    };
  }

  // Resolve places via Places API only — never trust model coordinates
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
    // Exclusions labels resolved later on user confirm via Places search in UI
    if (!ex.label.trim()) unresolvedPlaces.push("(esclusione senza nome)");
  }

  if (unresolvedPlaces.length > 0) {
    return {
      status: "needs_clarification",
      clarificationQuestions: [
        `Non riesco a risolvere in modo verificabile: ${unresolvedPlaces.join(", ")}. Specifica meglio o seleziona dalla ricerca.`,
      ],
      limitations,
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
