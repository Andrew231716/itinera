/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "@/lib/storage/backup";
import { createEmptyTrip } from "@/lib/types/trip";
describe("portable backup", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips a trip, includes the draft and excludes credentials", () => {
    const trip = createEmptyTrip("Prova");
    localStorage.setItem("itinera.lastSession.v1", JSON.stringify({ trip }));
    localStorage.setItem("sb-private-auth-token", "secret");
    const backup = createBackup();
    expect(backup).not.toContain("secret");
    localStorage.clear();
    expect(restoreBackup(backup)).toBe(1);
    expect(
      JSON.parse(localStorage.getItem("itinera.trips.v1")!)[0].meta.id,
    ).toBe(trip.meta.id);
  });
  it("merges newer trip data without dropping other trips", () => {
    const first = createEmptyTrip("First");
    const second = createEmptyTrip("Second");
    localStorage.setItem("itinera.trips.v1", JSON.stringify([first]));
    const backup = createBackup();
    first.meta.updatedAt = "2099-01-01T00:00:00Z";
    first.meta.title = "More recent";
    localStorage.setItem("itinera.trips.v1", JSON.stringify([first, second]));
    restoreBackup(backup);
    const trips = JSON.parse(localStorage.getItem("itinera.trips.v1")!);
    expect(trips).toHaveLength(2);
    expect(trips[0].meta.title).toBe("More recent");
  });
  it("rejects invalid or unsupported data before any write", () => {
    const trip = createEmptyTrip();
    localStorage.setItem("itinera.trips.v1", JSON.stringify([trip]));
    const before = localStorage.getItem("itinera.trips.v1");
    expect(() =>
      restoreBackup(
        JSON.stringify({
          format: "itinera-backup",
          version: 1,
          data: { "itinera.trips.v1": [trip], unknown: [] },
        }),
      ),
    ).toThrow();
    expect(localStorage.getItem("itinera.trips.v1")).toBe(before);
    expect(() =>
      restoreBackup(
        JSON.stringify({
          format: "itinera-backup",
          version: 1,
          data: { "itinera.trips.v1": [{}] },
        }),
      ),
    ).toThrow();
  });
});
