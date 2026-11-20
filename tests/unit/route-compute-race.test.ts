/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { useRouteCompute } from "@/hooks/useRouteCompute";
import { useTripStore } from "@/lib/store/trip-store";
import { createEmptyTrip } from "@/lib/types/trip";
let root: Root;
let calculateA: ReturnType<typeof useRouteCompute>["computeRoute"];
let calculateB: typeof calculateA;
function Harness() {
  calculateA = useRouteCompute().computeRoute;
  calculateB = useRouteCompute().computeRoute;
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useTripStore.getState().loadTrip(createEmptyTrip());
  useTripStore
    .getState()
    .setOrigin({
      id: "a",
      label: "A",
      location: { lat: 45, lng: 9 },
      source: "manual",
    });
  useTripStore
    .getState()
    .setDestination({
      id: "b",
      label: "B",
      location: { lat: 46, lng: 9 },
      source: "manual",
    });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
const result = (id: string) => ({
  ok: true,
  json: async () => ({
    mode: "live",
    routes: [
      {
        id,
        label: id,
        decodedPath: [],
        legs: [],
        warnings: [],
        violations: [],
        distanceMeters: 1,
        durationSeconds: 1,
        engine: "google_routes",
      },
    ],
  }),
});
it("ignores an obsolete response when the destination changes during calculation", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const request = calculateA();
  useTripStore
    .getState()
    .setDestination({
      id: "c",
      label: "C",
      location: { lat: 47, lng: 9 },
      source: "manual",
    });
  finish(result("old"));
  await request;
  expect(useTripStore.getState().routes).toHaveLength(0);
});
it("coordinates requests made from different sections", async () => {
  const finish: Array<(value: unknown) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise((resolve) => finish.push(resolve))),
  );
  const first = calculateA();
  const second = calculateB();
  finish[1](result("new"));
  await second;
  finish[0](result("old"));
  await first;
  expect(useTripStore.getState().routes[0].id).toBe("new");
});
