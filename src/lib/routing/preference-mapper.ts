import type { RoadPreferences } from "@/lib/types/trip";

export interface GooglePreferenceMapping {
  routingPreference: "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL" | "FUEL_EFFICIENT";
  routeModifiers: {
    avoidTolls: boolean;
    avoidHighways: boolean;
    avoidFerries: boolean;
  };
  limitations: string[];
}

/**
 * Maps UX preferences to Google Routes API fields.
 * Soft preferences that lack native support are documented in limitations.
 */
export function mapPreferencesToGoogle(
  preferences: RoadPreferences,
): GooglePreferenceMapping {
  const limitations: string[] = [];

  let routingPreference: GooglePreferenceMapping["routingPreference"] =
    "TRAFFIC_AWARE_OPTIMAL";

  if (preferences.preferShortest && !preferences.preferFastest) {
    // Google Routes does not expose a pure "shortest" flag; FUEL_EFFICIENT is closer.
    routingPreference = "FUEL_EFFICIENT";
    limitations.push(
      "«Percorso più breve» è mappato su un’indicazione preferenziale (fuel-efficient), non su una garanzia di distanza minima.",
    );
  } else if (preferences.preferFastest) {
    routingPreference = "TRAFFIC_AWARE_OPTIMAL";
  }

  if (preferences.preferFastest && preferences.preferShortest) {
    limitations.push(
      "Velocità e brevità sono entrambe attive: il motore bilancia secondo le proprie euristiche.",
    );
  }

  if (preferences.avoidTunnels) {
    limitations.push(
      "«Evita tunnel» non è supportato nativamente da Google Routes: trattato come preferenza soft non applicata dal motore.",
    );
  }

  if (preferences.preferScenic) {
    limitations.push(
      "«Strade panoramiche» è una preferenza soft: non esiste un flag nativo nelle Routes API.",
    );
  }

  if (preferences.maxExtraMinutes != null) {
    limitations.push(
      `Limite di +${preferences.maxExtraMinutes} min: applicabile solo in post-filtro sulle alternative restituite, non come vincolo nativo.`,
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
  };
}
