/** Datos de prueba. No son registros reales. */
import { describe, expect, it } from "vitest";
import {
  applyPurchaseToStock,
  buildShoppingLines,
  buildShoppingLinesNormalized,
  convertQuantity,
  estimateFoodCost,
  fromCanonical,
  quantityAfterStock,
  roundQty,
  scaleRecipeLines,
  type RecipeForShopping,
} from "./shopping";
import type { IngredientUnit } from "./types";

function ingredient(input: {
  ingredientId: number;
  name: string;
  unit: IngredientUnit;
  quantity: number;
  supplierId?: number | null;
  supplierName?: string | null;
  unitPrice?: number | null;
}): RecipeForShopping["ingredients"][number] {
  return {
    ingredientId: input.ingredientId,
    name: input.name,
    unit: input.unit,
    quantity: input.quantity,
    supplierId: input.supplierId ?? null,
    supplierName: input.supplierName ?? null,
    unitPrice: input.unitPrice === undefined ? null : input.unitPrice,
  };
}

describe("roundQty y conversión de unidades", () => {
  it("redondea a tres decimales", () => {
    expect(roundQty(1.2344)).toBe(1.234);
    expect(roundQty(1.2346)).toBe(1.235);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });

  it("convierte dentro de la misma familia y rechaza familias distintas", () => {
    expect(convertQuantity(1.5, "kg", "g")).toBe(1500);
    expect(convertQuantity(250, "ml", "L")).toBe(0.25);
    expect(convertQuantity(2, "unidad", "unidad")).toBe(2);
    expect(convertQuantity(2, "kg", "L")).toBeNull();
    expect(convertQuantity(2, "g", "unidad")).toBeNull();
  });

  it("pasa a kg o L desde 1000 y deja 1000 g cuando el valor aún no llegaba", () => {
    expect(fromCanonical(1000, "g")).toEqual({ quantity: 1, unit: "kg" });
    expect(fromCanonical(1500, "ml")).toEqual({ quantity: 1.5, unit: "L" });
    expect(fromCanonical(999, "g")).toEqual({ quantity: 999, unit: "g" });
    expect(fromCanonical(999.9996, "g")).toEqual({ quantity: 1000, unit: "g" });
  });
});

describe("quantityAfterStock", () => {
  it("resta el stock convertido a la unidad de la necesidad", () => {
    expect(quantityAfterStock(2, "kg", 500, "g")).toBe(1.5);
    expect(quantityAfterStock(0.5, "L", 200, "ml")).toBe(0.3);
    expect(quantityAfterStock(10, "unidad", 3, "unidad")).toBe(7);
  });

  it("no resta stock de otra familia y un stock negativo aumenta lo que hay que comprar", () => {
    expect(quantityAfterStock(10, "unidad", 3, "kg")).toBe(10);
    expect(quantityAfterStock(10, "unidad", -5, "unidad")).toBe(15);
  });

  it("no deja cantidades negativas", () => {
    expect(quantityAfterStock(1, "kg", 2500, "g")).toBe(0);
  });
});

describe("applyPurchaseToStock", () => {
  it("suma al marcar, resta al desmarcar y no baja de cero", () => {
    expect(applyPurchaseToStock(1, "kg", 500, "g", false, true)).toBe(1.5);
    expect(applyPurchaseToStock(1, "kg", 500, "g", true, false)).toBe(0.5);
    expect(applyPurchaseToStock(0.2, "kg", 500, "g", true, false)).toBe(0);
  });

  it("no cambia el stock si la marca no cambia o las unidades no convierten", () => {
    expect(applyPurchaseToStock(1.2346, "kg", 100, "g", true, true)).toBe(1.235);
    expect(applyPurchaseToStock(1, "kg", 2, "unidad", false, true)).toBe(1);
  });
});

describe("scaleRecipeLines", () => {
  it("escala al rendimiento y fusiona por nombre en la unidad visible", () => {
    expect(
      scaleRecipeLines(2, 2, [
        { name: "TEST Azúcar", unit: "g", quantity: 500 },
        { name: "TEST Azúcar", unit: "kg", quantity: 0.6 },
        { name: "TEST Sal", unit: "g", quantity: 10 },
      ]),
    ).toEqual([
      { name: "TEST Azúcar", quantity: 1.1, unit: "kg" },
      { name: "TEST Sal", quantity: 10, unit: "g" },
    ]);
  });

  it("un rendimiento en cero se trata como uno", () => {
    expect(scaleRecipeLines(0, 4, [{ name: "TEST Pan", unit: "unidad", quantity: 1 }])).toEqual([
      { name: "TEST Pan", quantity: 4, unit: "unidad" },
    ]);
  });
});

describe("buildShoppingLines y costo", () => {
  const recipes: RecipeForShopping[] = [
    {
      yieldPortions: 10,
      portions: 20,
      ingredients: [
        ingredient({
          ingredientId: 101,
          name: "TEST Harina",
          unit: "g",
          quantity: 600,
          supplierId: 1,
          supplierName: "TEST Molino",
          unitPrice: 2,
        }),
        ingredient({
          ingredientId: 103,
          name: "TEST Sal",
          unit: "g",
          quantity: 5,
          unitPrice: 1,
        }),
      ],
    },
    {
      yieldPortions: 1,
      portions: 1,
      ingredients: [
        ingredient({
          ingredientId: 101,
          name: "TEST Harina",
          unit: "kg",
          quantity: 0.5,
          supplierId: 1,
          supplierName: "TEST Molino",
          unitPrice: 2000,
        }),
        ingredient({
          ingredientId: 102,
          name: "TEST Aceite",
          unit: "L",
          quantity: 0.4,
          supplierId: 2,
          supplierName: "TEST Almacén",
          unitPrice: 5000,
        }),
      ],
    },
  ];

  it("escala, fusiona unidades y ordena por proveedor y nombre", () => {
    const lines = buildShoppingLines(recipes);

    expect(lines).toEqual(buildShoppingLinesNormalized(recipes));
    expect(lines).toEqual([
      {
        ingredientId: 102,
        name: "TEST Aceite",
        unit: "ml",
        quantity: 400,
        supplierId: 2,
        supplierName: "TEST Almacén",
        unitPrice: 5,
      },
      {
        ingredientId: 101,
        name: "TEST Harina",
        unit: "kg",
        quantity: 1.7,
        supplierId: 1,
        supplierName: "TEST Molino",
        unitPrice: 2000,
      },
      {
        ingredientId: 103,
        name: "TEST Sal",
        unit: "g",
        quantity: 10,
        supplierId: null,
        supplierName: null,
        unitPrice: 1,
      },
    ]);
  });

  it("el costo estimado conserva el precio por la cantidad escalada", () => {
    // Harina: 600 g × 2 + 0,5 kg × 2000. Aceite: 0,4 L × 5000. Sal: 10 g × 1.
    expect(estimateFoodCost(recipes)).toBe(2400 + 1000 + 2000 + 10);
  });

  it("ignora líneas sin precio y conserva un precio cero", () => {
    const priced = estimateFoodCost([
      {
        yieldPortions: 1,
        portions: 2,
        ingredients: [
          ingredient({
            ingredientId: 201,
            name: "TEST Agua",
            unit: "L",
            quantity: 1,
            unitPrice: null,
          }),
          ingredient({
            ingredientId: 202,
            name: "TEST Hielo",
            unit: "unidad",
            quantity: 3,
            unitPrice: 0,
          }),
        ],
      },
    ]);

    expect(priced).toBe(0);
  });

  it("al fusionar se queda con el precio de la primera línea", () => {
    const lines = buildShoppingLines([
      {
        yieldPortions: 1,
        portions: 1,
        ingredients: [
          ingredient({
            ingredientId: 301,
            name: "TEST Azúcar",
            unit: "g",
            quantity: 100,
            unitPrice: 2,
          }),
        ],
      },
      {
        yieldPortions: 1,
        portions: 1,
        ingredients: [
          ingredient({
            ingredientId: 301,
            name: "TEST Azúcar",
            unit: "g",
            quantity: 50,
            unitPrice: 99,
          }),
        ],
      },
    ]);

    expect(lines).toEqual([
      {
        ingredientId: 301,
        name: "TEST Azúcar",
        unit: "g",
        quantity: 150,
        supplierId: null,
        supplierName: null,
        unitPrice: 2,
      },
    ]);
    expect(estimateFoodCost([
      {
        yieldPortions: 1,
        portions: 1,
        ingredients: [
          ingredient({ ingredientId: 301, name: "TEST Azúcar", unit: "g", quantity: 100, unitPrice: 2 }),
          ingredient({ ingredientId: 301, name: "TEST Azúcar", unit: "g", quantity: 50, unitPrice: 99 }),
        ],
      },
    ])).toBe(300);
  });
});
