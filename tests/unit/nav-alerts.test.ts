import { describe, expect, it } from "vitest";
import {
  findNextAlertAhead,
  parseMaxspeedKmh,
  projectAlertsOntoRoute,
  voiceCueForAlert,
  type NavAlert,
} from "@/lib/navigation/alerts";
import { parseOverpassAlerts } from "@/lib/osm/overpass-alerts";

describe("parseMaxspeedKmh", () => {
  it("parses numeric and Italian defaults", () => {
    expect(parseMaxspeedKmh("50")).toBe(50);
    expect(parseMaxspeedKmh("90 km/h")).toBe(90);
    expect(parseMaxspeedKmh("IT:urban")).toBe(50);
    expect(parseMaxspeedKmh("IT:motorway")).toBe(130);
    expect(parseMaxspeedKmh("30 mph")).toBe(48);
    expect(parseMaxspeedKmh("none")).toBeNull();
  });
});

describe("projectAlertsOntoRoute", () => {
  it("keeps alerts near the path and sets offset", () => {
    const path = [
      { lat: 45.36, lng: 9.32 },
      { lat: 45.37, lng: 9.33 },
      { lat: 45.38, lng: 9.34 },
    ];
    const alerts: NavAlert[] = [
      {
        id: "1",
        kind: "speed_camera",
        label: "Autovelox",
        location: { lat: 45.3701, lng: 9.3301 },
        maxspeedKmh: 50,
        routeOffsetMeters: null,
      },
      {
        id: "2",
        kind: "roadworks",
        label: "Lavori",
        location: { lat: 46.5, lng: 10.5 },
        maxspeedKmh: null,
        routeOffsetMeters: null,
      },
    ];
    const projected = projectAlertsOntoRoute(alerts, path, 120);
    expect(projected.some((a) => a.id === "1")).toBe(true);
    expect(projected.find((a) => a.id === "1")?.routeOffsetMeters).not.toBeNull();
    expect(projected.some((a) => a.id === "2")).toBe(false);
  });
});

describe("findNextAlertAhead", () => {
  it("returns the next camera ahead", () => {
    const alerts: NavAlert[] = [
      {
        id: "a",
        kind: "speed_camera",
        label: "A",
        location: { lat: 0, lng: 0 },
        maxspeedKmh: 50,
        routeOffsetMeters: 100,
      },
      {
        id: "b",
        kind: "roadworks",
        label: "B",
        location: { lat: 0, lng: 0 },
        maxspeedKmh: null,
        routeOffsetMeters: 800,
      },
    ];
    const next = findNextAlertAhead(alerts, 200, 1200);
    expect(next?.alert.id).toBe("b");
    expect(next?.metersAhead).toBe(600);
  });
});

describe("voiceCueForAlert", () => {
  it("mentions kind and distance", () => {
    const cue = voiceCueForAlert(
      {
        id: "x",
        kind: "traffic_light_camera",
        label: "Semaforo",
        location: { lat: 0, lng: 0 },
        maxspeedKmh: null,
        routeOffsetMeters: 400,
      },
      350,
    );
    expect(cue.toLowerCase()).toContain("semaforico");
    expect(cue).toContain("350");
  });
});

describe("parseOverpassAlerts", () => {
  it("classifies cameras and maxspeed ways", () => {
    const result = parseOverpassAlerts([
      {
        type: "node",
        id: 1,
        lat: 45.4,
        lon: 9.2,
        tags: { highway: "speed_camera", maxspeed: "50" },
      },
      {
        type: "node",
        id: 2,
        lat: 45.41,
        lon: 9.21,
        tags: { enforcement: "traffic_signals" },
      },
      {
        type: "way",
        id: 3,
        center: { lat: 45.4, lon: 9.2 },
        tags: { highway: "primary", maxspeed: "70" },
      },
      {
        type: "way",
        id: 4,
        center: { lat: 45.42, lon: 9.22 },
        tags: { highway: "construction" },
      },
    ]);
    expect(result.alerts.some((a) => a.kind === "speed_camera")).toBe(true);
    expect(result.alerts.some((a) => a.kind === "traffic_light_camera")).toBe(
      true,
    );
    expect(result.alerts.some((a) => a.kind === "roadworks")).toBe(true);
    expect(result.speedLimitSamples[0]?.maxspeedKmh).toBe(70);
  });
});
