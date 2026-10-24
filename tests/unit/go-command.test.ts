import { describe, expect, it } from "vitest";
import {
  extractGoDestination,
  isGoLikeUtterance,
} from "@/lib/voice/go-command";

describe("extractGoDestination", () => {
  it("parses Italian portami phrases", () => {
    expect(
      extractGoDestination("portami in via gardenie a Rozzano"),
    ).toBe("via gardenie a Rozzano");
    expect(extractGoDestination("Portami a Milano Centrale")).toBe(
      "Milano Centrale",
    );
    expect(extractGoDestination("naviga verso il Duomo di Milano")).toBe(
      "il Duomo di Milano",
    );
  });

  it("strips Siri / Itinera wrappers", () => {
    expect(
      extractGoDestination(
        "Hey Siri portami in via gardenie a Rozzano con Itinera",
      ),
    ).toMatch(/via gardenie a Rozzano/i);
  });

  it("accepts bare addresses", () => {
    expect(extractGoDestination("Via Gardenie 12 Rozzano")).toBe(
      "Via Gardenie 12 Rozzano",
    );
  });

  it("rejects empty / too short", () => {
    expect(extractGoDestination("")).toBeNull();
    expect(extractGoDestination("ab")).toBeNull();
  });
});

describe("isGoLikeUtterance", () => {
  it("detects go commands", () => {
    expect(isGoLikeUtterance("portami a casa")).toBe(true);
  });
});
