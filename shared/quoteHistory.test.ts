import { describe, expect, it } from "vitest";
import { isQuoteSuperseded } from "./quoteHistory";

describe("isQuoteSuperseded", () => {
  it.each([
    [1, [1, 2, 3], true],
    [3, [1, 2, 3], false],
    [2, [2, 2], false],
    [4, [], false],
    [4, [9, 1], true],
    [5, [5], false],
  ] as const)("versión %s entre %j → %s", (version, versions, expected) => {
    expect(isQuoteSuperseded(version, [...versions])).toBe(expected);
  });
});
