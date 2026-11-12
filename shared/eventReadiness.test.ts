/** Datos de prueba. No son registros reales. */
import { describe, expect, it } from "vitest";
import {
  buildReadiness,
  packingProgress,
  readinessChips,
  shoppingReadiness,
  shoppingStatusLabel,
} from "./eventReadiness";

describe("shoppingReadiness", () => {
  it.each([
    [3, 3, false, "none"],
    [0, 0, false, "none"],
    [0, 0, true, "done"],
    [4, 0, true, "done"],
    [0, 3, true, "pending"],
    [1, 3, true, "partial"],
    [3, 3, true, "done"],
    [4, 3, true, "done"],
  ] as const)(
    "comprados %s de %s (lista %s) → %s",
    (purchased, total, listExists, expected) => {
      expect(shoppingReadiness(purchased, total, listExists)).toBe(expected);
    },
  );
});

describe("packingProgress", () => {
  it("sin datos usa la lista por defecto, nada empacado", () => {
    expect(packingProgress(undefined)).toEqual({ done: 0, total: 6 });
    expect(packingProgress([])).toEqual({ done: 0, total: 6 });
    expect(packingProgress("no-es-lista")).toEqual({ done: 0, total: 6 });
  });

  it("cuenta solo lo marcado en la lista guardada", () => {
    expect(
      packingProgress([
        { id: 4, label: "TEST Caja", quantity: 2, packed: true },
        { id: 5, label: "TEST Hielo", quantity: 1, packed: false },
      ]),
    ).toEqual({ done: 1, total: 2 });
  });
});

describe("buildReadiness", () => {
  it("junta menú, packing y compras", () => {
    expect(
      buildReadiness({
        recipeCount: 2,
        packing: [{ id: 1, label: "TEST Caja", quantity: 1, packed: true }],
        purchased: 1,
        shoppingItemCount: 4,
        listExists: true,
      }),
    ).toEqual({
      recipeCount: 2,
      packingDone: 1,
      packingTotal: 1,
      shopping: "partial",
    });
  });
});

describe("shoppingStatusLabel", () => {
  it.each([
    ["done", 0, "Primero el menú"],
    ["none", 2, "Falta generar la lista"],
    ["pending", 2, "Lista sin marcar"],
    ["partial", 2, "Compra a medias"],
    ["done", 2, "Lista comprada"],
  ] as const)("compras %s con %s recetas → %s", (shopping, recipes, expected) => {
    expect(shoppingStatusLabel(shopping, recipes)).toBe(expected);
  });
});

describe("readinessChips", () => {
  it("un evento cancelado no muestra pendientes", () => {
    expect(
      readinessChips({
        status: "cancelado",
        recipeCount: 0,
        shopping: "none",
        packingDone: 0,
        packingTotal: 6,
        balance: 1000,
      }),
    ).toEqual([]);
  });

  it("sin menú avisa el menú y no la lista, y suma packing y saldo", () => {
    expect(
      readinessChips({
        status: "confirmado",
        recipeCount: 0,
        shopping: "pending",
        packingDone: 1,
        packingTotal: 6,
        balance: 1500,
      }),
    ).toEqual([
      { key: "menu", label: "Sin menú" },
      { key: "packing", label: "Packing" },
      { key: "saldo", label: "Saldo" },
    ]);
  });

  it.each([
    ["none", "Sin lista"],
    ["pending", "Compras"],
    ["partial", "Compras a medias"],
  ] as const)("con menú y compras %s muestra %s", (shopping, label) => {
    expect(
      readinessChips({
        recipeCount: 1,
        shopping,
        packingDone: 6,
        packingTotal: 6,
        balance: 0,
      }),
    ).toEqual([{ key: "compras", label }]);
  });

  it("lista comprada y packing completo no agregan esos chips", () => {
    expect(
      readinessChips({
        status: "realizado",
        recipeCount: 2,
        shopping: "done",
        packingDone: 3,
        packingTotal: 3,
        balance: null,
      }),
    ).toEqual([]);
  });

  it("el saldo solo aparece si es mayor que cero", () => {
    const base = {
      recipeCount: 1,
      shopping: "done" as const,
      packingDone: 1,
      packingTotal: 1,
    };
    expect(readinessChips({ ...base, balance: 0 })).toEqual([]);
    expect(readinessChips({ ...base, balance: -10 })).toEqual([]);
    expect(readinessChips({ ...base, balance: 1 })).toEqual([{ key: "saldo", label: "Saldo" }]);
  });
});
