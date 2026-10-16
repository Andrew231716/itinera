import { describe, expect, it } from "vitest";
import {
  classifyManeuver,
  extractRoadHint,
} from "@/lib/navigation/maneuver-icons";

describe("classifyManeuver", () => {
  it("detects roundabout and turns", () => {
    expect(
      classifyManeuver(
        "Alla rotonda prendi la 2ª uscita e prendi Via delle Forze Armate",
      ),
    ).toBe("roundabout");
    expect(classifyManeuver("Gira a sinistra")).toBe("left");
    expect(classifyManeuver("Turn right onto Main St")).toBe("right");
    expect(classifyManeuver("Prosegui dritto")).toBe("straight");
    expect(classifyManeuver("Fai un'inversione a U")).toBe("u_turn");
  });
});

describe("extractRoadHint", () => {
  it("pulls road names from Italian instructions", () => {
    expect(
      extractRoadHint(
        "Alla rotonda prendi la 2ª uscita e prendi Via delle Forze Armate",
      ),
    ).toMatch(/Via delle Forze Armate/i);
  });
});
