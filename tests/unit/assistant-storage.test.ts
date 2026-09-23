import { describe, expect, it } from "vitest";
import { AssistantStructuredSchema } from "@/lib/ai/assistant";
import { LocalTripRepository } from "@/lib/storage/trip-repository";
import { createEmptyTrip } from "@/lib/types/trip";

describe("assistant schema", () => {
  it("rejects invalid structured payloads", () => {
    const bad = AssistantStructuredSchema.safeParse({ status: "ok" });
    expect(bad.success).toBe(false);
  });

  it("accepts a minimal valid structured payload", () => {
    const ok = AssistantStructuredSchema.safeParse({
      status: "ok",
      originText: "Rozzano",
      destinationText: "Roma",
      stopTexts: ["Firenze"],
      travelMode: "DRIVE",
      preferences: {
        avoidTolls: true,
        avoidHighways: null,
        avoidFerries: null,
        avoidTunnels: null,
        preferFastest: true,
        preferShortest: null,
        preferScenic: true,
        maxExtraMinutes: 60,
      },
      hardExclusions: [{ kind: "city", label: "Bologna" }],
      softNotes: [],
      clarificationQuestions: [],
      unsupportedRequests: [],
      reorderStops: false,
      titleSuggestion: "Rozzano–Roma",
    });
    expect(ok.success).toBe(true);
  });
});

describe("local trip repository", () => {
  it("saves duplicates and removes trips in memory-like storage", async () => {
    const store = new Map<string, string>();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    // @ts-expect-error test polyfill
    globalThis.window = { localStorage: ls };
    // @ts-expect-error test polyfill
    globalThis.localStorage = ls;

    const repo = new LocalTripRepository();
    const trip = createEmptyTrip("Test");
    trip.meta.id = "trip-a";
    await repo.save(trip);
    const listed = await repo.list();
    expect(listed.some((t) => t.meta.id === "trip-a")).toBe(true);

    const copy = await repo.duplicate("trip-a");
    expect(copy?.meta.title).toContain("copia");
    expect(copy?.meta.id).not.toBe("trip-a");

    await repo.remove("trip-a");
    expect(await repo.get("trip-a")).toBeNull();
  });
});
