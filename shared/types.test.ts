import { describe, expect, it } from "vitest";
import {
  isEventStatus,
  isIngredientUnit,
  isPaymentMethod,
  isQuoteStatus,
  isServiceType,
  quoteTotal,
} from "./types";

describe("totales y tipos de cotización", () => {
  it("suma cantidad por precio sin redondear", () => {
    expect(
      quoteTotal([
        { description: "TEST Menú", quantity: 2, unitPrice: 1500 },
        { description: "TEST Extra", quantity: 1, unitPrice: 500 },
      ]),
    ).toBe(3500);
    expect(quoteTotal([{ description: "TEST", quantity: 2, unitPrice: 10.25 }])).toBe(20.5);
    expect(quoteTotal([])).toBe(0);
  });

  it("los guardias distinguen mayúsculas y tipos que no son texto", () => {
    expect(isEventStatus("realizado")).toBe(true);
    expect(isEventStatus("Realizado")).toBe(false);
    expect(isServiceType("coffee_break")).toBe(true);
    expect(isServiceType("brunch")).toBe(false);
    expect(isIngredientUnit("kg")).toBe(true);
    expect(isIngredientUnit("gr")).toBe(false);
    expect(isQuoteStatus("aceptada")).toBe(true);
    expect(isQuoteStatus("pagada")).toBe(false);
    expect(isPaymentMethod("transferencia")).toBe(true);
    expect(isPaymentMethod("cheque")).toBe(false);
    expect(isEventStatus(1)).toBe(false);
  });
});
