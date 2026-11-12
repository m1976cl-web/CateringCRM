import { describe, expect, it } from "vitest";
import {
  FLOW_COPY,
  canAutofillQuoteFromEvent,
  dueDateOrEventDay,
  emptyListCopy,
  eventListPaymentNote,
  invalidFieldMessage,
  isLowStock,
  isUntouchedQuoteItem,
  quoteCopiedMessage,
  quoteItemsForSave,
  stockQtyHint,
} from "./flowUsability";

const blank = { description: "", quantity: 1, unitPrice: 0 };

describe("lista vacía y filtros", () => {
  it("ofrece crear solo cuando no hay filtro ni búsqueda", () => {
    expect(emptyListCopy(false, "No hay eventos", FLOW_COPY.eventsEmpty, FLOW_COPY.eventsSearch)).toEqual({
      title: "No hay eventos",
      description: FLOW_COPY.eventsEmpty,
      offerCreate: true,
    });
  });

  it("un filtro sin resultados no invita a crear otro registro", () => {
    const copy = emptyListCopy(true, "Sin cotizaciones", FLOW_COPY.quotesEmpty, FLOW_COPY.quotesSearch);
    expect(copy.offerCreate).toBe(false);
    expect(copy.title).toBe("Nada coincide");
    expect(copy.description).toBe(FLOW_COPY.quotesSearch);
  });
});

describe("cotización desde el evento", () => {
  it("copia sola una cotización nueva y en blanco", () => {
    expect(
      canAutofillQuoteFromEvent({ editing: false, items: [blank], notes: "", paymentCount: 0 }),
    ).toBe(true);
    expect(canAutofillQuoteFromEvent({ editing: false, items: [], notes: "  ", paymentCount: 0 })).toBe(
      true,
    );
  });

  it("no pisa texto, abonos ni una cotización que se está editando", () => {
    expect(
      canAutofillQuoteFromEvent({
        editing: false,
        items: [{ description: "Menú", quantity: 1, unitPrice: 10 }],
        notes: "",
        paymentCount: 0,
      }),
    ).toBe(false);
    expect(
      canAutofillQuoteFromEvent({ editing: false, items: [blank], notes: "sin gluten", paymentCount: 0 }),
    ).toBe(false);
    expect(
      canAutofillQuoteFromEvent({ editing: false, items: [blank], notes: "", paymentCount: 1 }),
    ).toBe(false);
    expect(
      canAutofillQuoteFromEvent({ editing: true, items: [blank], notes: "", paymentCount: 0 }),
    ).toBe(false);
  });

  it("ignora filas vacías al guardar y exige al menos un ítem usable", () => {
    const prepared = quoteItemsForSave([
      blank,
      { description: "  Almuerzo  ", quantity: 2, unitPrice: Number.NaN },
      { description: "Café", quantity: 0, unitPrice: 1000 },
    ]);
    expect(prepared.error).toBeNull();
    expect(prepared.items).toEqual([{ description: "Almuerzo", quantity: 2, unitPrice: 0 }]);
    expect(quoteItemsForSave([blank]).error).toBe(FLOW_COPY.quoteItemsMissing);
  });

  it("no trata como vacío un ítem con precio", () => {
    expect(isUntouchedQuoteItem({ description: "", quantity: 1, unitPrice: 500 })).toBe(false);
  });

  it("conserva el vencimiento escrito y, si está vacío, usa el día del evento", () => {
    expect(dueDateOrEventDay("2026-12-01T10:00", "2026-12-20T12:00")).toBe("2026-12-01T10:00");
    expect(dueDateOrEventDay("  ", "2026-12-20T12:00")).toBe("2026-12-20T12:00");
  });

  it("avisa cuando el evento no trae precio, sin inventar uno", () => {
    expect(quoteCopiedMessage(false)).toContain("no hay precio");
    expect(quoteCopiedMessage(true)).not.toContain("no hay precio");
  });
});

describe("stock", () => {
  it("marca bajo mínimo solo si hay un mínimo y el stock lo alcanza", () => {
    expect(isLowStock(2, 5)).toBe(true);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
  });

  it("explica el stock al crear y el ajuste al editar", () => {
    expect(stockQtyHint(false)).toBe(FLOW_COPY.stockHintNew);
    expect(stockQtyHint(true)).toContain("ajuste");
    expect(stockQtyHint(false)).not.toContain("abajo");
  });
});

describe("mensajes y validación", () => {
  it("traduce los avisos nativos del navegador", () => {
    expect(
      invalidFieldMessage(
        { valueMissing: true, rangeUnderflow: false, rangeOverflow: false },
        { valueMissing: FLOW_COPY.fieldEventDate },
      ),
    ).toBe(FLOW_COPY.fieldEventDate);
    expect(
      invalidFieldMessage(
        { valueMissing: false, rangeUnderflow: true, rangeOverflow: false },
        { rangeUnderflow: FLOW_COPY.fieldStockQty },
      ),
    ).toBe(FLOW_COPY.fieldStockQty);
    expect(
      invalidFieldMessage(
        { valueMissing: false, rangeUnderflow: false, rangeOverflow: false },
        { valueMissing: FLOW_COPY.fieldEventTitle },
      ),
    ).toBe("");
  });

  it("en la lista, saldo cero se lee como pagado", () => {
    const format = (value: number) => `$${value}`;
    expect(eventListPaymentNote(0, 0, format)).toBe("");
    expect(eventListPaymentNote(1000, 200, format)).toBe("saldo $200");
    expect(eventListPaymentNote(1000, 0, format)).toBe("pagado");
  });

  it("el montaje no mezcla inglés", () => {
    expect(FLOW_COPY.setupHint.toLowerCase()).not.toContain("setup");
  });
});
