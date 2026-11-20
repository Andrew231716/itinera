/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTravelWorkspace } from "@/hooks/useTravelWorkspace";
import { useTripStore } from "@/lib/store/trip-store";
import { createEmptyTrip } from "@/lib/types/trip";
vi.mock("@/lib/storage/trip-repository", () => ({
  syncPendingTrips: vi.fn(),
  getTripRepository: vi.fn(),
}));
let workspace: ReturnType<typeof useTravelWorkspace>;
let root: ReturnType<typeof createRoot>;
function Harness() {
  workspace = useTravelWorkspace();
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  localStorage.clear();
  useTripStore.getState().loadTrip(createEmptyTrip());
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("does not overwrite the resumable journey before the user resumes or starts editing", async () => {
  const trip = createEmptyTrip("In attesa");
  const saved = JSON.stringify({ trip, routes: [], title: trip.meta.title });
  localStorage.setItem("itinera.lastSession.v1", saved);
  await act(async () => root.render(createElement(Harness)));
  expect(workspace.resume?.trip.meta.id).toBe(trip.meta.id);
  window.dispatchEvent(new Event("pagehide"));
  expect(localStorage.getItem("itinera.lastSession.v1")).toBe(saved);
});
it("flushes fresh edits when the app is closed before the debounce", async () => {
  await act(async () => root.render(createElement(Harness)));
  await act(async () =>
    useTripStore.getState().setTitle("Il viaggio modificato"),
  );
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(
    JSON.parse(localStorage.getItem("itinera.lastSession.v1")!).trip.meta.title,
  ).toBe("Il viaggio modificato");
});
