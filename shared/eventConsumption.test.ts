/** Datos de prueba. No son registros reales. */
import { describe, expect, it } from "vitest";
import {
  STOCK_SHORT_PREFIX,
  eventReadyText,
  planMenuConsumption,
  shouldConsumeMenu,
  stockShortMessage,
  type ConsumptionLine,
} from "./eventConsumption";

describe("planMenuConsumption", () => {
  it("suma el mismo ingrediente en la unidad de stock y descuenta solo lo disponible", () => {
    const lines = planMenuConsumption(
      [
        { ingredientId: 101, name: "nombre en el menú", unit: "g", quantity: 200 },
        { ingredientId: 101, name: "nombre en el menú", unit: "kg", quantity: 0.3 },
      ],
      new Map([[101, { stockQty: 0.1, unit: "kg", name: "TEST Harina" }]]),
    );

    expect(lines).toEqual<ConsumptionLine[]>([
      {
        ingredientId: 101,
        name: "TEST Harina",
        unit: "kg",
        need: 0.5,
        stock: 0.1,
        deduct: 0.1,
        short: 0.4,
      },
    ]);
  });

  it("sin ficha de stock deja el faltante completo y conserva el nombre pedido", () => {
    const lines = planMenuConsumption(
      [{ ingredientId: 102, name: "TEST Aceite", unit: "ml", quantity: 250.4 }],
      new Map(),
    );

    expect(lines).toEqual<ConsumptionLine[]>([
      {
        ingredientId: 102,
        name: "TEST Aceite",
        unit: "ml",
        need: 250.4,
        stock: 0,
        deduct: 0,
        short: 250.4,
      },
    ]);
  });

  it("si el stock cubre el menú, el faltante queda en cero y el stock informado es el de antes", () => {
    const lines = planMenuConsumption(
      [{ ingredientId: 103, name: "TEST Sal", unit: "g", quantity: 20 }],
      new Map([[103, { stockQty: 80, unit: "g", name: "TEST Sal" }]]),
    );

    expect(lines[0]).toMatchObject({ need: 20, stock: 80, deduct: 20, short: 0 });
  });

  it("ignora cantidades que no son positivas y trata el stock negativo como cero", () => {
    const lines = planMenuConsumption(
      [
        { ingredientId: 104, name: "TEST Pan", unit: "unidad", quantity: 0 },
        { ingredientId: 104, name: "TEST Pan", unit: "unidad", quantity: -2 },
        { ingredientId: 105, name: "TEST Huevo", unit: "unidad", quantity: 4 },
      ],
      new Map([[105, { stockQty: -3, unit: "unidad", name: "TEST Huevo" }]]),
    );

    expect(lines).toEqual<ConsumptionLine[]>([
      {
        ingredientId: 105,
        name: "TEST Huevo",
        unit: "unidad",
        need: 4,
        stock: 0,
        deduct: 0,
        short: 4,
      },
    ]);
  });

  it("mantiene el orden en que aparecen los ingredientes", () => {
    const lines = planMenuConsumption(
      [
        { ingredientId: 202, name: "TEST Azúcar", unit: "g", quantity: 10 },
        { ingredientId: 201, name: "TEST Café", unit: "g", quantity: 5 },
      ],
      new Map(),
    );

    expect(lines.map((line) => line.ingredientId)).toEqual([202, 201]);
  });

  it("si la unidad de stock no es convertible, hoy omite el ingrediente", () => {
    const lines = planMenuConsumption(
      [{ ingredientId: 106, name: "TEST Huevo", unit: "unidad", quantity: 12 }],
      new Map([[106, { stockQty: 500, unit: "g", name: "TEST Huevo" }]]),
    );

    expect(lines).toEqual([]);
  });

  // Bug: al no poder convertir, el insumo desaparece y el evento puede marcarse realizado sin avisar el faltante.
  it.skip("unidad incompatible: debería informar el faltante sin descontar stock", () => {
    const lines = planMenuConsumption(
      [{ ingredientId: 106, name: "TEST Huevo", unit: "unidad", quantity: 12 }],
      new Map([[106, { stockQty: 500, unit: "g", name: "TEST Huevo" }]]),
    );

    expect(lines).toEqual<ConsumptionLine[]>([
      {
        ingredientId: 106,
        name: "TEST Huevo",
        unit: "unidad",
        need: 12,
        stock: 0,
        deduct: 0,
        short: 12,
      },
    ]);
  });
});

describe("stockShortMessage", () => {
  it("nombra solo los ingredientes que faltan", () => {
    const lines: ConsumptionLine[] = [
      {
        ingredientId: 101,
        name: "TEST Harina",
        unit: "kg",
        need: 2,
        stock: 0.5,
        deduct: 0.5,
        short: 1.5,
      },
      {
        ingredientId: 102,
        name: "TEST Sal",
        unit: "g",
        need: 10,
        stock: 10,
        deduct: 10,
        short: 0,
      },
    ];

    expect(stockShortMessage(lines)).toBe(
      `${STOCK_SHORT_PREFIX} TEST Harina (faltan 1.5 kg).`,
    );
  });
});

describe("shouldConsumeMenu", () => {
  it.each([
    ["confirmado", "realizado", false, true],
    ["borrador", "realizado", false, true],
    ["cancelado", "realizado", false, true],
    ["realizado", "realizado", false, false],
    ["confirmado", "realizado", true, false],
    ["confirmado", "confirmado", false, false],
    ["realizado", "cancelado", false, false],
  ] as const)(
    "de %s a %s (ya consumido: %s) → %s",
    (previous, next, alreadyConsumed, expected) => {
      expect(shouldConsumeMenu(previous, next, alreadyConsumed)).toBe(expected);
    },
  );
});

describe("eventReadyText", () => {
  it("arma el mensaje con lugar y saldo, recortando espacios", () => {
    expect(
      eventReadyText({
        title: "TEST Boda",
        when: "vie 12 nov",
        location: "  TEST Salón  ",
        balanceLabel: "  Saldo de prueba  ",
      }),
    ).toBe(
      [
        "Hola, el evento «TEST Boda» está listo.",
        "Fecha: vie 12 nov",
        "Lugar: TEST Salón",
        "Saldo de prueba",
        "Cualquier cambio, avísanos.",
      ].join("\n"),
    );
  });

  it("omite lugar y saldo vacíos", () => {
    expect(
      eventReadyText({
        title: "TEST Coffee",
        when: "lun 1 dic",
        location: "   ",
        balanceLabel: null,
      }),
    ).toBe(
      [
        "Hola, el evento «TEST Coffee» está listo.",
        "Fecha: lun 1 dic",
        "Cualquier cambio, avísanos.",
      ].join("\n"),
    );
  });
});
