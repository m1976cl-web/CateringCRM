/** Vectores de prueba. No son credenciales reales. */
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  normalizeRecoveryCode,
  randomRecoveryCode,
  randomToken,
  sha256Hex,
  verifyPassword,
} from "./password";

const TEST_SALT = "00112233445566778899aabbccddeeff";
const TEST_PASSWORD = "test-password";

describe("contraseñas", () => {
  it("el mismo salt y la misma clave producen el mismo hash y verifican", async () => {
    const first = await hashPassword(TEST_PASSWORD, TEST_SALT);
    const second = await hashPassword(TEST_PASSWORD, TEST_SALT);

    expect(first).toEqual(second);
    expect(first.salt).toBe(TEST_SALT);
    expect(await verifyPassword(TEST_PASSWORD, first.salt, first.hash)).toBe(true);
    expect(await verifyPassword("otra-clave", first.salt, first.hash)).toBe(false);
    expect(await verifyPassword(TEST_PASSWORD, "", first.hash)).toBe(false);
    expect(await verifyPassword(TEST_PASSWORD, first.salt, "")).toBe(false);
    expect(await verifyPassword(TEST_PASSWORD, first.salt, "aa")).toBe(false);
  });

  it("sha256 de un texto fijo", async () => {
    expect(await sha256Hex("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });
});

describe("códigos", () => {
  it("normaliza el código de recuperación", () => {
    expect(normalizeRecoveryCode("  abcd-efgh  ")).toBe("ABCDEFGH");
    expect(normalizeRecoveryCode("test-code-123")).toBe("TESTCODE123");
  });

  it("el token y el código de recuperación tienen el formato esperado", () => {
    expect(randomToken()).toMatch(/^[0-9a-f]{64}$/);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 30; i += 1) {
      expect(randomRecoveryCode()).toMatch(
        new RegExp(`^[${alphabet}]{4}-[${alphabet}]{4}-[${alphabet}]{4}$`),
      );
    }
  });
});
