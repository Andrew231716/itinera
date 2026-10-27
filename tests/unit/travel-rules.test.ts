import { describe, expect, it } from "vitest";
import {
  countActiveTravelRules,
  listActiveTravelRules,
  summarizeTravelRules,
} from "@/lib/routing/travel-rules";
import {
  DEFAULT_ROAD_PREFERENCES,
  type CustomExclusion,
} from "@/lib/types/trip";

const sampleExclusion: CustomExclusion = {
  id: "e1",
  kind: "city",
  label: "Milano",
  strength: "hard",
  createdAt: "2026-01-01T00:00:00.000Z",
  radiusMeters: 500,
};

describe("travel-rules", () => {
  it("treats defaults as no active rules", () => {
    expect(countActiveTravelRules(DEFAULT_ROAD_PREFERENCES)).toBe(0);
    expect(summarizeTravelRules(DEFAULT_ROAD_PREFERENCES)).toBe(
      "Nessuna regola",
    );
  });

  it("lists avoid toggles in plain Italian", () => {
    const prefs = {
      ...DEFAULT_ROAD_PREFERENCES,
      avoidTolls: true,
      avoidHighways: true,
    };
    const items = listActiveTravelRules(prefs);
    expect(items.map((i) => i.label)).toEqual([
      "Niente pedaggi",
      "Niente autostrade",
    ]);
    expect(summarizeTravelRules(prefs)).toBe("Pedaggi · Autostrade");
  });

  it("counts exclusions as one rule bucket", () => {
    const prefs = { ...DEFAULT_ROAD_PREFERENCES, avoidFerries: true };
    expect(countActiveTravelRules(prefs, [sampleExclusion])).toBe(2);
    expect(
      summarizeTravelRules(prefs, [sampleExclusion, sampleExclusion]),
    ).toBe("Traghetti · 2 escl.");
    const many = {
      ...DEFAULT_ROAD_PREFERENCES,
      avoidTolls: true,
      avoidHighways: true,
      avoidFerries: true,
    };
    expect(summarizeTravelRules(many, [sampleExclusion])).toBe("4 regole");
  });

  it("shows breve only when not also fastest", () => {
    const both = {
      ...DEFAULT_ROAD_PREFERENCES,
      preferFastest: true,
      preferShortest: true,
    };
    expect(listActiveTravelRules(both).some((i) => i.id === "preferShortest")).toBe(
      false,
    );
    const onlyShort = {
      ...DEFAULT_ROAD_PREFERENCES,
      preferFastest: false,
      preferShortest: true,
    };
    expect(listActiveTravelRules(onlyShort).map((i) => i.id)).toContain(
      "preferShortest",
    );
  });
});
