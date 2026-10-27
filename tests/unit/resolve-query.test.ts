import { describe, expect, it } from "vitest";
import { parseAddressLines } from "@/lib/places/resolve-query";

describe("parseAddressLines", () => {
  it("splits lines and strips numbering", () => {
    const text = `1. Via Roma 1, Milano
2) Piazza Duomo, Firenze
;  Corso Italia 10
`;
    expect(parseAddressLines(text)).toEqual([
      "Via Roma 1, Milano",
      "Piazza Duomo, Firenze",
      "Corso Italia 10",
    ]);
  });

  it("returns empty for blank input", () => {
    expect(parseAddressLines("  \n  ")).toEqual([]);
  });
});
