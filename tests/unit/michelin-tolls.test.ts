import { describe, expect, it } from "vitest";
import {
  attachMichelinToTollInfo,
  enrichRoutesWithMichelinTolls,
  matchMichelinRoute,
} from "@/lib/michelin/enrich-tolls";
import type { MichelinRouteTolls } from "@/lib/michelin/tolls-client";
import type { ComputedRoute } from "@/lib/types/route";

const michelinA1: MichelinRouteTolls = {
  summary: "A1",
  distanceMeters: 573_000,
  durationSeconds: 20_815,
  tolls: { amount: 45.6, currencyCode: "EUR" },
  barriers: [
    { name: "Roma Nord", cost: { amount: 45.6, currencyCode: "EUR" } },
  ],
  vignettes: [
    {
      name: "Péage urbain de Milan",
      message: "Area C",
      cost: { amount: 7.5, currencyCode: "EUR" },
    },
  ],
};

const michelinAlt: MichelinRouteTolls = {
  summary: "Strada Statale 3bis",
  distanceMeters: 638_000,
  durationSeconds: 34_750,
  tolls: { amount: 10.4, currencyCode: "EUR" },
  barriers: [
    { name: "Cesena Nord", cost: { amount: 6.2, currencyCode: "EUR" } },
    { name: "Roma Nord", cost: { amount: 4.2, currencyCode: "EUR" } },
  ],
  vignettes: [],
};

describe("matchMichelinRoute", () => {
  it("picks the closest Michelin distance to the Google route", () => {
    const matched = matchMichelinRoute(580_000, [michelinA1, michelinAlt]);
    expect(matched?.summary).toBe("A1");
    expect(matched?.tolls?.amount).toBe(45.6);
  });

  it("prefers the longer alternative when Google distance is closer to it", () => {
    const matched = matchMichelinRoute(640_000, [michelinA1, michelinAlt]);
    expect(matched?.summary).toBe("Strada Statale 3bis");
  });
});

describe("attachMichelinToTollInfo", () => {
  it("combines Google and Michelin estimates", () => {
    const tolls = attachMichelinToTollInfo(
      {
        hasTolls: true,
        estimatedPrice: 42,
        currencyCode: "EUR",
        source: "google_routes",
      },
      michelinA1,
    );
    expect(tolls.source).toBe("combined");
    expect(tolls.estimatedPrice).toBe(42);
    expect(tolls.michelin?.estimatedPrice).toBe(45.6);
    expect(tolls.michelin?.barriers?.[0]?.name).toBe("Roma Nord");
    expect(tolls.michelin?.vignettes?.[0]?.amount).toBe(7.5);
  });

  it("fills Michelin-only when Google has no toll payload", () => {
    const tolls = attachMichelinToTollInfo(undefined, michelinA1);
    expect(tolls.hasTolls).toBe(true);
    expect(tolls.source).toBe("michelin");
    expect(tolls.michelin?.estimatedPrice).toBe(45.6);
  });
});

describe("enrichRoutesWithMichelinTolls", () => {
  it("attaches matched Michelin data onto computed routes", () => {
    const routes: ComputedRoute[] = [
      {
        id: "google-0",
        label: "Percorso consigliato",
        distanceMeters: 575_000,
        durationSeconds: 20_000,
        polyline: "",
        decodedPath: [],
        legs: [],
        tolls: {
          hasTolls: true,
          estimatedPrice: 40,
          currencyCode: "EUR",
          source: "google_routes",
        },
        warnings: [],
        violations: [],
        engine: "google_routes",
      },
    ];

    const enriched = enrichRoutesWithMichelinTolls(routes, {
      routes: [michelinA1, michelinAlt],
      sourceUrl: "https://www.viamichelin.it/itinerari",
    });

    expect(enriched[0].tolls?.michelin?.estimatedPrice).toBe(45.6);
    expect(enriched[0].tolls?.source).toBe("combined");
  });
});
