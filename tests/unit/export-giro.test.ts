import { describe, expect, it } from "vitest";
import {
  buildGiroMapsLink,
  buildGiroPdfHtml,
} from "@/lib/giro/export-giro";
import type { GiroStop, ScheduleStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";
import { DEFAULT_ROAD_PREFERENCES } from "@/lib/types/trip";

function place(id: string, label: string): PlaceRef {
  return {
    id,
    label,
    location: { lat: 45, lng: 9 },
    source: "manual",
  };
}

function stop(id: string, label: string): GiroStop {
  return {
    id,
    place: place(id, label),
    arriveBy: null,
    positionLock: "auto",
  };
}

describe("buildGiroMapsLink", () => {
  it("builds a Google Maps directions URL", () => {
    const link = buildGiroMapsLink({
      origin: place("o", "Milano"),
      stops: [place("a", "Bergamo"), place("b", "Brescia")],
      preferences: { ...DEFAULT_ROAD_PREFERENCES, avoidTolls: true },
    });
    expect(link).not.toBeNull();
    expect(link!.url).toContain("google.com/maps/dir");
    expect(link!.includedPreferences).toContain("Evita pedaggi");
  });

  it("returns null without stops", () => {
    expect(
      buildGiroMapsLink({ origin: place("o", "Milano"), stops: [] }),
    ).toBeNull();
  });
});

describe("buildGiroPdfHtml", () => {
  it("includes title, stops and schedule times", () => {
    const schedule: ScheduleStop[] = [
      {
        kind: "origin",
        place: place("o", "Milano"),
        arrivalAt: "2026-10-28T08:00:00.000Z",
        legFromPreviousSeconds: 0,
        cumulativeSeconds: 0,
      },
      {
        kind: "destination",
        place: place("d", "Roma"),
        arrivalAt: "2026-10-28T12:00:00.000Z",
        legFromPreviousSeconds: 14_400,
        cumulativeSeconds: 14_400,
      },
    ];
    const html = buildGiroPdfHtml(
      {
        title: "Giro prova",
        origin: place("o", "Milano"),
        departureAt: "2026-10-28T08:00:00.000Z",
        stops: [stop("d", "Roma")],
        schedule,
      },
      "https://www.google.com/maps/dir/?api=1",
    );
    expect(html).toContain("Giro prova");
    expect(html).toContain("Milano");
    expect(html).toContain("Roma");
    expect(html).toContain("google.com/maps/dir");
  });
});
