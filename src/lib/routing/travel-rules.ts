import type { CustomExclusion, RoadPreferences } from "@/lib/types/trip";

/** Plain-language rule labels for UI chips and summaries. */
export type TravelRuleId =
  | "avoidTolls"
  | "avoidHighways"
  | "avoidFerries"
  | "preferShortest"
  | "exclusions";

export type TravelRuleItem = {
  id: TravelRuleId;
  label: string;
  shortLabel: string;
};

/**
 * Active trip rules the driver can understand at a glance.
 * Prefer-fastest is the default and is omitted unless something else is on.
 */
export function listActiveTravelRules(
  preferences: RoadPreferences,
  exclusions: CustomExclusion[] = [],
): TravelRuleItem[] {
  const items: TravelRuleItem[] = [];
  if (preferences.avoidTolls) {
    items.push({
      id: "avoidTolls",
      label: "Niente pedaggi",
      shortLabel: "Pedaggi",
    });
  }
  if (preferences.avoidHighways) {
    items.push({
      id: "avoidHighways",
      label: "Niente autostrade",
      shortLabel: "Autostrade",
    });
  }
  if (preferences.avoidFerries) {
    items.push({
      id: "avoidFerries",
      label: "Niente traghetti",
      shortLabel: "Traghetti",
    });
  }
  if (preferences.preferShortest && !preferences.preferFastest) {
    items.push({
      id: "preferShortest",
      label: "Percorso più breve",
      shortLabel: "Breve",
    });
  }
  if (exclusions.length > 0) {
    items.push({
      id: "exclusions",
      label:
        exclusions.length === 1
          ? "1 luogo da evitare"
          : `${exclusions.length} luoghi da evitare`,
      shortLabel:
        exclusions.length === 1 ? "1 esclusione" : `${exclusions.length} escl.`,
    });
  }
  return items;
}

export function countActiveTravelRules(
  preferences: RoadPreferences,
  exclusions: CustomExclusion[] = [],
): number {
  return listActiveTravelRules(preferences, exclusions).length;
}

/** Compact chip text, e.g. "Pedaggi · Autostrade" or "Nessuna regola". */
export function summarizeTravelRules(
  preferences: RoadPreferences,
  exclusions: CustomExclusion[] = [],
): string {
  const items = listActiveTravelRules(preferences, exclusions);
  if (items.length === 0) return "Nessuna regola";
  if (items.length <= 2) return items.map((i) => i.shortLabel).join(" · ");
  return `${items.length} regole`;
}
