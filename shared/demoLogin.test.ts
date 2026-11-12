import { describe, expect, it } from "vitest";
import { DEMO_USER_EMAIL, DEMO_USER_NAME, isDemoUserEmail, parseDemoLoginFlag } from "./demoLogin";

describe("login de prueba", () => {
  it("el usuario de prueba es el definido en el módulo", () => {
    expect(DEMO_USER_EMAIL).toBe("demo@cateringcrm.app");
    expect(DEMO_USER_NAME).toBe("Prueba");
    expect(isDemoUserEmail("  Demo@CateringCRM.app ")).toBe(true);
    expect(isDemoUserEmail("otra@test.invalid")).toBe(false);
    expect(isDemoUserEmail(null)).toBe(false);
  });

  it.each([
    [undefined, true],
    [null, true],
    ["", true],
    ["  ", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["off", false],
    ["no", false],
    [" no ", false],
    ["nope", true],
    ["true", true],
    ["1", true],
    ["yes", true],
  ] as const)("parseDemoLoginFlag(%j) → %s", (value, expected) => {
    expect(parseDemoLoginFlag(value)).toBe(expected);
  });
});
