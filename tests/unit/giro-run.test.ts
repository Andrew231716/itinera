import { describe, expect, it } from "vitest";
import type { ScheduleStop } from "@/lib/routing/travel-schedule";
import type { PlaceRef } from "@/lib/types/trip";
import {
  addStopDelayMinutes,
  createGiroRun,
  markArrived,
  markDeparted,
  projectGiroRun,
  startGiroRun,
} from "@/lib/giro/giro-run";

function place(id: string): PlaceRef {
  return {
    id,
    label: id,
    location: { lat: 45, lng: 9 },
    source: "manual",
  };
}

function row(
  partial: Partial<ScheduleStop> & {
    kind: ScheduleStop["kind"];
    place: PlaceRef;
    arrivalAt: string;
  },
): ScheduleStop {
  return {
    departAt: partial.arrivalAt,
    dwellMinutes: 0,
    pauseMinutes: 0,
    legFromPreviousSeconds: 0,
    legFromPreviousMeters: 0,
    cumulativeSeconds: 0,
    ...partial,
  };
}

const schedule: ScheduleStop[] = [
  row({
    kind: "origin",
    place: place("O"),
    arrivalAt: "2026-10-29T08:00:00.000Z",
    departAt: "2026-10-29T08:00:00.000Z",
  }),
  row({
    kind: "stop",
    place: place("A"),
    giroStopId: "a",
    arrivalAt: "2026-10-29T08:20:00.000Z",
    departAt: "2026-10-29T08:30:00.000Z",
    dwellMinutes: 10,
    legFromPreviousSeconds: 1200,
    legFromPreviousMeters: 8000,
    cumulativeSeconds: 1200,
  }),
  row({
    kind: "destination",
    place: place("B"),
    giroStopId: "b",
    arrivalAt: "2026-10-29T08:50:00.000Z",
    departAt: "2026-10-29T08:50:00.000Z",
    dwellMinutes: 0,
    legFromPreviousSeconds: 1200,
    legFromPreviousMeters: 9000,
    cumulativeSeconds: 3000,
  }),
];

describe("giro run", () => {
  it("starts at origin and records arrival delta on the next stop", () => {
    let run = startGiroRun(createGiroRun(schedule), new Date("2026-10-29T08:00:00.000Z"));
    expect(run.status).toBe("running");
    expect(run.logs[0].status).toBe("at_stop");

    run = markDeparted(run, new Date("2026-10-29T08:00:00.000Z"));
    expect(run.currentIndex).toBe(1);
    expect(run.logs[1].status).toBe("en_route");

    run = markArrived(run, new Date("2026-10-29T08:25:00.000Z"));
    expect(run.logs[1].status).toBe("at_stop");
    expect(run.logs[1].arrivalDeltaSeconds).toBe(5 * 60);
  });

  it("extra delay extends suggested depart and next ETA", () => {
    let run = startGiroRun(createGiroRun(schedule), new Date("2026-10-29T08:00:00.000Z"));
    run = markDeparted(run, new Date("2026-10-29T08:00:00.000Z"));
    run = markArrived(run, new Date("2026-10-29T08:20:00.000Z"));
    run = addStopDelayMinutes(run, 5);

    const proj = projectGiroRun(
      run,
      schedule,
      new Date("2026-10-29T08:20:00.000Z"),
    );
    expect(proj.suggestedDepartAt).toBe("2026-10-29T08:35:00.000Z");
    expect(proj.nextEtas[0]?.label).toBe("B");
  });

  it("includes auto pause in suggested depart", () => {
    const withPause: ScheduleStop[] = [
      schedule[0],
      { ...schedule[1], pauseMinutes: 12, departAt: "2026-10-29T08:42:00.000Z" },
      schedule[2],
    ];
    let run = startGiroRun(
      createGiroRun(withPause),
      new Date("2026-10-29T08:00:00.000Z"),
    );
    run = markDeparted(run, new Date("2026-10-29T08:00:00.000Z"));
    run = markArrived(run, new Date("2026-10-29T08:20:00.000Z"));

    const proj = projectGiroRun(
      run,
      withPause,
      new Date("2026-10-29T08:20:00.000Z"),
    );
    // dwell 10 + pause 12 = leave 08:42
    expect(proj.suggestedDepartAt).toBe("2026-10-29T08:42:00.000Z");
    expect(run.logs[1].pauseMinutes).toBe(12);
  });
});
