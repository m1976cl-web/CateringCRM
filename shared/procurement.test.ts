/** Datos de prueba. No son registros reales. */
import { describe, expect, it } from "vitest";
import {
  buildEventOperatingResult,
  clampStock,
  isOpenPurchaseStatus,
  isPurchaseOrderStatus,
  isStockMovementKind,
  movementDelta,
  pendingOrderGroups,
  pricePerLineUnit,
} from "./procurement";

describe("movimiento de stock", () => {
  it("reconoce los tipos", () => {
    expect(isStockMovementKind("merma")).toBe(true);
    expect(isStockMovementKind("venta")).toBe(false);
    expect(isPurchaseOrderStatus("recibida")).toBe(true);
    expect(isPurchaseOrderStatus("pagada")).toBe(false);
    expect(isOpenPurchaseStatus("borrador")).toBe(true);
    expect(isOpenPurchaseStatus("enviada")).toBe(true);
    expect(isOpenPurchaseStatus("recibida")).toBe(false);
  });

  it("el ajuste conserva el signo y el resto usa el valor absoluto", () => {
    expect(movementDelta("entrada", -2)).toBe(2);
    expect(movementDelta("recepcion", 1.2346)).toBe(1.235);
    expect(movementDelta("merma", 3)).toBe(-3);
    expect(movementDelta("reserva", 1)).toBe(-1);
    expect(movementDelta("consumo", 2)).toBe(-2);
    expect(movementDelta("ajuste", -1.5)).toBe(-1.5);
    expect(movementDelta("ajuste", 0)).toBe(0);
    expect(movementDelta("merma", 0)).toBe(0);
    expect(movementDelta("entrada", Number.NaN)).toBe(0);
    expect(movementDelta("entrada", Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("no deja el stock bajo cero y el aplicado es lo que realmente cambió", () => {
    expect(clampStock(5, 2)).toEqual({ next: 7, applied: 2 });
    expect(clampStock(1, -4)).toEqual({ next: 0, applied: -1 });
  });
});

describe("precio y grupos de pedido", () => {
  it("lleva el precio del catálogo a la unidad de la línea", () => {
    expect(pricePerLineUnit(1000, "kg", "g")).toBe(1);
    expect(pricePerLineUnit(1000, "kg", "kg")).toBe(1000);
    expect(pricePerLineUnit(2500, "L", "ml")).toBe(2.5);
    expect(pricePerLineUnit(null, "kg", "g")).toBe(0);
    expect(pricePerLineUnit(Number.NaN, "kg", "g")).toBe(0);
    expect(pricePerLineUnit(2500, "kg", "unidad")).toBe(2500);
  });

  it("agrupa lo no comprado por proveedor y omite cantidad vacía", () => {
    expect(
      pendingOrderGroups([
        {
          ingredientId: 101,
          name: "TEST Harina",
          unit: "kg",
          quantity: 2,
          unitPrice: 1000,
          supplierId: 7,
          purchased: false,
          catalogUnit: "kg",
        },
        {
          ingredientId: 102,
          name: "TEST Sal",
          unit: "g",
          quantity: 500,
          unitPrice: 1000,
          supplierId: 7,
          purchased: false,
          catalogUnit: "kg",
        },
        {
          ingredientId: 103,
          name: "TEST Pan",
          unit: "unidad",
          quantity: 4,
          unitPrice: 300,
          supplierId: null,
          purchased: false,
          catalogUnit: "unidad",
        },
        {
          ingredientId: 104,
          name: "TEST Ya comprado",
          unit: "unidad",
          quantity: 9,
          unitPrice: 10,
          supplierId: 7,
          purchased: true,
          catalogUnit: "unidad",
        },
        {
          ingredientId: 105,
          name: "TEST Cero",
          unit: "unidad",
          quantity: 0,
          unitPrice: 10,
          supplierId: null,
          purchased: false,
          catalogUnit: "unidad",
        },
      ]),
    ).toEqual([
      {
        supplierId: 7,
        lines: [
          { ingredientId: 101, quantity: 2, unit: "kg", unitPrice: 1000 },
          { ingredientId: 102, quantity: 500, unit: "g", unitPrice: 1 },
        ],
      },
      {
        supplierId: null,
        lines: [{ ingredientId: 103, quantity: 4, unit: "unidad", unitPrice: 300 }],
      },
    ]);
  });
});

describe("resultado operativo del evento", () => {
  it("prioriza la venta aceptada y suma lo recibido de pedidos no cancelados", () => {
    expect(
      buildEventOperatingResult({
        acceptedRevenue: 100_000,
        estimatedSale: 80_000,
        estimatedFood: 20_000,
        expenses: [{ amount: 500 }, { amount: 250 }],
        orders: [
          {
            status: "recibida",
            invoiceTotal: 4_000,
            items: [{ receivedQty: 2, unitPrice: 1_500 }],
          },
          {
            status: "cancelada",
            invoiceTotal: 9_999,
            items: [{ receivedQty: 9, unitPrice: 1_000 }],
          },
          {
            status: "borrador",
            invoiceTotal: null,
            items: [{ receivedQty: 1, unitPrice: 100 }],
          },
          {
            status: "enviada",
            invoiceTotal: 100,
            items: [],
          },
        ],
      }),
    ).toEqual({
      revenue: 100_000,
      revenueSource: "aceptada",
      estimatedFood: 20_000,
      actualFood: 3_100,
      otherCosts: 750,
      actualCost: 3_850,
      margin: 96_150,
      marginPct: 96,
      openOrders: 2,
      invoiced: 4_100,
    });
  });

  it("sin venta aceptada usa la estimada y sin ninguna deja el margen vacío", () => {
    expect(
      buildEventOperatingResult({
        acceptedRevenue: 0,
        estimatedSale: 80_000,
        estimatedFood: 0,
        expenses: [],
        orders: [],
      }),
    ).toMatchObject({ revenue: 80_000, revenueSource: "estimada", margin: 80_000, marginPct: 100 });

    expect(
      buildEventOperatingResult({
        acceptedRevenue: 0,
        estimatedSale: 0,
        estimatedFood: 10,
        expenses: [],
        orders: [],
      }),
    ).toMatchObject({
      revenue: 0,
      revenueSource: "ninguna",
      margin: null,
      marginPct: null,
      estimatedFood: 10,
    });
  });
});
