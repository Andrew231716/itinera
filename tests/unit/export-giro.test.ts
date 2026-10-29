import { describe, expect, it } from "vitest";
import {
  buildGiroListPdfBlob,
  buildGiroMapsLink,
  buildGiroPdfHtml,
  exportGiroPdf,
  pdfSafeText,
} from "@/lib/giro/export-giro";
import type { GiroStop, ScheduleStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";
import { DEFAULT_ROAD_PREFERENCES } from "@/lib/types/trip";

function place(id: string, label: string, lat = 45, lng = 9): PlaceRef {
  return {
    id,
    label,
    location: { lat, lng },
    source: "manual",
  };
}

function stop(id: string, label: string): GiroStop {
  return {
    id,
    place: place(id, label),
    arriveBy: "2026-10-28T10:30:00.000Z",
    positionLock: "last",
  };
}

const sampleDoc = {
  title: "Giro prova",
  origin: place("o", "Milano", 45.46, 9.19),
  departureAt: "2026-10-28T08:00:00.000Z",
  stops: [stop("d", "Roma")],
  schedule: [
    {
      kind: "origin",
      place: place("o", "Milano", 45.46, 9.19),
      arrivalAt: "2026-10-28T08:00:00.000Z",
      legFromPreviousSeconds: 0,
      cumulativeSeconds: 0,
    },
    {
      kind: "destination",
      place: place("d", "Roma", 41.9, 12.5),
      arrivalAt: "2026-10-28T12:00:00.000Z",
      legFromPreviousSeconds: 14_400,
      cumulativeSeconds: 14_400,
      arriveBy: "2026-10-28T10:30:00.000Z",
    },
  ] satisfies ScheduleStop[],
  preferences: { ...DEFAULT_ROAD_PREFERENCES, avoidTolls: true },
  travelMode: "DRIVE" as const,
};

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
    const html = buildGiroPdfHtml(
      sampleDoc,
      "https://www.google.com/maps/dir/?api=1",
    );
    expect(html).toContain("Giro prova");
    expect(html).toContain("Milano");
    expect(html).toContain("Roma");
    expect(html).toContain("google.com/maps/dir");
  });
});

describe("buildGiroListPdfBlob", () => {
  it("produces a PDF blob", () => {
    const blob = buildGiroListPdfBlob(sampleDoc);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("pdf");
    expect(blob.size).toBeGreaterThan(500);
  });
});

describe("exportGiroPdf", () => {
  it("returns false without a DOM", () => {
    expect(exportGiroPdf(sampleDoc, "list")).toEqual({
      ok: false,
      error: "PDF disponibile solo nel browser.",
    });
  });
});

describe("pdfSafeText", () => {
  it("keeps latin accented letters and strips exotic symbols", () => {
    expect(pdfSafeText("Città · Milano ✅")).toContain("Citt");
    expect(pdfSafeText("Città · Milano ✅")).not.toContain("✅");
  });
});
