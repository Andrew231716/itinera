import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePianoFermateText,
  pianoFermateToGiroStops,
  romeLocalToIso,
  splitIndexAndTime,
} from "@/lib/giro/parse-piano-fermate";

const SAMPLE_TXT = readFileSync(
  "tests/fixtures/piano-fermate-sample.txt",
  "utf8",
);

describe("splitIndexAndTime", () => {
  it("splits glued index+hour", () => {
    expect(splitIndexAndTime("110", "30")).toEqual({
      index: 1,
      time: "10:30",
    });
    expect(splitIndexAndTime("1012", "30")).toEqual({
      index: 10,
      time: "12:30",
    });
    expect(splitIndexAndTime("813", "00")).toEqual({
      index: 8,
      time: "13:00",
    });
  });
});

describe("parsePianoFermateText", () => {
  it("parses LogiTrack piano fermate extracted text", () => {
    const parsed = parsePianoFermateText(SAMPLE_TXT);
    expect(parsed).not.toBeNull();
    expect(parsed!.dateLabel).toBe("29/10/2026");
    expect(parsed!.giroName).toContain("AA Milano Centro Est");
    expect(parsed!.stops.length).toBe(12);
    expect(parsed!.stops[0]).toMatchObject({
      index: 1,
      time: "10:30",
      name: expect.stringContaining("Cerba Milano Viale Monza"),
    });
    expect(parsed!.stops[11].time).toBe("13:00");
    expect(parsed!.stops[11].name.toLowerCase()).toContain("cerbahealthcare");
    expect(parsed!.departureAt).toBeTruthy();
  });

  it("parses spaced human-readable text", () => {
    const text = `Piano fermate driver
Data: 29/10/2026
Giri: Test Giro
Totale elementi: 2
1 10:30 Cerba Milano Viale Monza Fermata
2 11:00 Imbio Lab Fermata
`;
    const parsed = parsePianoFermateText(text);
    expect(parsed?.stops.map((s) => s.name)).toEqual([
      "Cerba Milano Viale Monza",
      "Imbio Lab",
    ]);
  });

  it("builds giro stops with locked order and arriveBy", () => {
    const parsed = parsePianoFermateText(SAMPLE_TXT)!;
    let n = 0;
    const stops = pianoFermateToGiroStops(parsed, () => `id-${++n}`);
    expect(stops).toHaveLength(12);
    expect(stops[0].positionLock).toBe(1);
    expect(stops[11].positionLock).toBe("last");
    expect(stops[0].arriveBy).toBe(
      romeLocalToIso(2026, 10, 29, 10, 30),
    );
  });
});
