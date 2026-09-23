import type { RoadPreferences } from "@/lib/types/trip";

/**
 * How a preference is applied by the current routing stack.
 * Never claim "respected" without evidence from the engine or verification.
 */
export type PreferenceApplicationStatus =
  | "engine_direct" // mapped to a native Google Routes field
  | "preferential" // mapped but not guaranteed by the API
  | "post_verified" // checked after route computation
  | "unsupported" // cannot be applied by current engine
  | "unverifiable"; // conceptually soft and not measurable here

export interface PreferenceStatusItem {
  key: keyof RoadPreferences;
  label: string;
  category: "soft" | "hard_capable";
  enabled: boolean;
  status: PreferenceApplicationStatus;
  explanation: string;
}

export function describePreferenceStatuses(
  preferences: RoadPreferences,
): PreferenceStatusItem[] {
  return [
    {
      key: "avoidTolls",
      label: "Evita pedaggi",
      category: "hard_capable",
      enabled: preferences.avoidTolls,
      status: preferences.avoidTolls ? "preferential" : "engine_direct",
      explanation: preferences.avoidTolls
        ? "Inviato a Google come routeModifiers.avoidTolls: indicazione preferenziale, non garanzia assoluta."
        : "Disattivato.",
    },
    {
      key: "avoidHighways",
      label: "Evita autostrade",
      category: "hard_capable",
      enabled: preferences.avoidHighways,
      status: preferences.avoidHighways ? "preferential" : "engine_direct",
      explanation: preferences.avoidHighways
        ? "Inviato come avoidHighways: preferenziale lato motore."
        : "Disattivato.",
    },
    {
      key: "avoidFerries",
      label: "Evita traghetti",
      category: "hard_capable",
      enabled: preferences.avoidFerries,
      status: preferences.avoidFerries ? "preferential" : "engine_direct",
      explanation: preferences.avoidFerries
        ? "Inviato come avoidFerries: preferenziale lato motore."
        : "Disattivato.",
    },
    {
      key: "avoidTunnels",
      label: "Evita tunnel",
      category: "soft",
      enabled: preferences.avoidTunnels,
      status: preferences.avoidTunnels ? "unsupported" : "unsupported",
      explanation:
        "Non supportato nativamente da Google Routes. Resta soft e non applicato dal motore.",
    },
    {
      key: "preferFastest",
      label: "Percorso più veloce",
      category: "soft",
      enabled: preferences.preferFastest,
      status: preferences.preferFastest ? "preferential" : "preferential",
      explanation: preferences.preferFastest
        ? "Mappato su TRAFFIC_AWARE_OPTIMAL (euristica del motore)."
        : "Disattivato.",
    },
    {
      key: "preferShortest",
      label: "Percorso più breve",
      category: "soft",
      enabled: preferences.preferShortest,
      status: preferences.preferShortest ? "preferential" : "preferential",
      explanation: preferences.preferShortest
        ? "Mappato su FUEL_EFFICIENT quando più veloce è off: non è distanza minima garantita."
        : "Disattivato.",
    },
    {
      key: "preferScenic",
      label: "Strade panoramiche",
      category: "soft",
      enabled: preferences.preferScenic,
      status: "unsupported",
      explanation:
        "Nessun flag nativo Routes API. Preferenza soft non applicabile automaticamente.",
    },
    {
      key: "maxExtraMinutes",
      label: "Limite aumento durata",
      category: "soft",
      enabled: preferences.maxExtraMinutes != null,
      status: preferences.maxExtraMinutes != null ? "post_verified" : "unverifiable",
      explanation:
        preferences.maxExtraMinutes != null
          ? `Filtra le alternative oltre +${preferences.maxExtraMinutes} min rispetto al riferimento.`
          : "Nessun limite impostato.",
    },
  ];
}

export interface GooglePreferenceMapping {
  routingPreference: "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL" | "FUEL_EFFICIENT";
  routeModifiers: {
    avoidTolls: boolean;
    avoidHighways: boolean;
    avoidFerries: boolean;
  };
  limitations: string[];
  statuses: PreferenceStatusItem[];
}

/**
 * Maps UX preferences to Google Routes API fields.
 * Soft preferences that lack native support are documented in limitations.
 */
export function mapPreferencesToGoogle(
  preferences: RoadPreferences,
): GooglePreferenceMapping {
  const statuses = describePreferenceStatuses(preferences);
  const limitations = statuses
    .filter((s) => s.enabled)
    .map((s) => `${s.label}: ${s.explanation}`);

  let routingPreference: GooglePreferenceMapping["routingPreference"] =
    "TRAFFIC_AWARE_OPTIMAL";

  if (preferences.preferShortest && !preferences.preferFastest) {
    routingPreference = "FUEL_EFFICIENT";
  } else if (preferences.preferFastest) {
    routingPreference = "TRAFFIC_AWARE_OPTIMAL";
  }

  if (preferences.preferFastest && preferences.preferShortest) {
    limitations.push(
      "Velocità e brevità sono entrambe attive: il motore bilancia secondo le proprie euristiche.",
    );
  }

  limitations.push(
    "Le preferenze stradali di Google sono indicazioni preferenziali, non garanzie assolute.",
  );

  return {
    routingPreference,
    routeModifiers: {
      avoidTolls: preferences.avoidTolls,
      avoidHighways: preferences.avoidHighways,
      avoidFerries: preferences.avoidFerries,
    },
    limitations,
    statuses,
  };
}
