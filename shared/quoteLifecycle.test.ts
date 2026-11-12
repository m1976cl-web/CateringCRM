import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateClientMoney,
  eventStatusAfterQuote,
  normalizeDeposit,
  paymentsFromQuoteInput,
  parseQuotePayments,
  quoteBalance,
  quoteMargin,
  sumPayments,
} from "./quoteLifecycle";

describe("eventStatusAfterQuote", () => {
  it.each([
    ["borrador", "enviada", "cotizado"],
    ["cotizado", "enviada", "cotizado"],
    ["confirmado", "enviada", "confirmado"],
    ["borrador", "aceptada", "confirmado"],
    ["cotizado", "aceptada", "confirmado"],
    ["confirmado", "aceptada", "confirmado"],
    ["borrador", "rechazada", "borrador"],
    ["cotizado", "borrador", "cotizado"],
    ["realizado", "aceptada", "realizado"],
    ["cancelado", "aceptada", "cancelado"],
    ["realizado", "enviada", "realizado"],
    ["cancelado", "enviada", "cancelado"],
  ] as const)("evento %s y cotización %s → %s", (current, quote, expected) => {
    expect(eventStatusAfterQuote(current, quote)).toBe(expected);
  });
});

describe("anticipos y saldo", () => {
  it("normaliza cada abono antes de sumar", () => {
    expect(normalizeDeposit("12.4")).toBe(12);
    expect(normalizeDeposit("12.5")).toBe(13);
    expect(normalizeDeposit(-3)).toBe(0);
    expect(normalizeDeposit("no")).toBe(0);
    expect(normalizeDeposit(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sumPayments([{ amount: 1.5 }, { amount: 1.5 }])).toBe(4);
  });

  it("el saldo no pasa del total ni queda negativo", () => {
    expect(quoteBalance(10000, 3000)).toEqual({ deposit: 3000, balance: 7000 });
    expect(quoteBalance(10000, 12000)).toEqual({ deposit: 10000, balance: 0 });
    expect(quoteBalance(-5, 100)).toEqual({ deposit: 0, balance: 0 });
    expect(quoteBalance(100.4, 10.6)).toEqual({ deposit: 11, balance: 89 });
  });

  it("el margen usa pesos enteros y un decimal en el porcentaje", () => {
    expect(quoteMargin(10000, 4000)).toEqual({
      foodCost: 4000,
      sale: 10000,
      margin: 6000,
      marginPct: 60,
    });
    expect(quoteMargin(3, 1)).toEqual({
      foodCost: 1,
      sale: 3,
      margin: 2,
      marginPct: 66.7,
    });
    expect(quoteMargin(0, 100)).toEqual({
      foodCost: 100,
      sale: 0,
      margin: -100,
      marginPct: null,
    });
    expect(quoteMargin(0, 0).marginPct).toBeNull();
  });

  it("el dinero del cliente solo cuenta cotizaciones aceptadas y topa el pago al total", () => {
    expect(
      aggregateClientMoney([
        { status: "aceptada", grandTotal: 10000, paid: 12000 },
        { status: "aceptada", grandTotal: 5000, paid: 1000 },
        { status: "enviada", grandTotal: 9000, paid: 9000 },
        { status: "rechazada", grandTotal: 8000, paid: 0 },
      ]),
    ).toEqual({ billed: 15000, paid: 11000, balance: 4000 });
  });
});

describe("pagos de la cotización", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("descarta montos vacíos, completa método y fecha, y conserva un id válido", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));

    expect(
      parseQuotePayments([
        { amount: 0, method: "efectivo" },
        { amount: 10.6, paidAt: "2026-04-02", method: "tarjeta", notes: "TEST abono", id: 4 },
        { amount: 20, paidAt: "no-es-fecha", method: "cheque", notes: "", id: 0 },
        { amount: 5, id: 1.5 },
      ]),
    ).toEqual([
      {
        id: 4,
        amount: 11,
        paidAt: "2026-04-02T00:00:00.000Z",
        method: "tarjeta",
        notes: "TEST abono",
      },
      {
        amount: 20,
        paidAt: "2026-05-01T12:00:00.000Z",
        method: "transferencia",
        notes: null,
      },
      {
        amount: 5,
        paidAt: "2026-05-01T12:00:00.000Z",
        method: "transferencia",
        notes: null,
      },
    ]);
  });

  it("si viene la lista, aunque esté vacía, no usa el anticipo único", () => {
    expect(paymentsFromQuoteInput({ payments: [], depositAmount: 5000 })).toEqual([]);
  });

  it("sin lista, un anticipo positivo se vuelve un pago de transferencia", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));

    expect(paymentsFromQuoteInput({ depositAmount: 1500.2 })).toEqual([
      {
        amount: 1500,
        paidAt: "2026-05-01T12:00:00.000Z",
        method: "transferencia",
        notes: "Anticipo",
      },
    ]);
    expect(paymentsFromQuoteInput({ depositAmount: 0 })).toEqual([]);
  });
});
