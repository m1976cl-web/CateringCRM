import { convertQuantity, roundQty } from "./shopping";
import type { IngredientUnit } from "./types";

export const STOCK_MOVEMENT_KINDS = ["entrada", "recepcion", "merma", "reserva", "ajuste"] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export const STOCK_KIND_LABELS: Record<StockMovementKind, string> = {
  entrada: "Entrada",
  recepcion: "Recepción",
  merma: "Merma",
  reserva: "Reserva",
  ajuste: "Ajuste",
};

export const PURCHASE_ORDER_STATUSES = ["borrador", "enviada", "recibida", "cancelada"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

export function isStockMovementKind(value: unknown): value is StockMovementKind {
  return typeof value === "string" && (STOCK_MOVEMENT_KINDS as readonly string[]).includes(value);
}

export function isPurchaseOrderStatus(value: unknown): value is PurchaseOrderStatus {
  return typeof value === "string" && (PURCHASE_ORDER_STATUSES as readonly string[]).includes(value);
}

/** Delta en la unidad del catálogo. Ajuste conserva el signo; el resto usa el valor absoluto. */
export function movementDelta(kind: StockMovementKind, qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  if (kind === "ajuste") return roundQty(qty);
  const abs = roundQty(Math.abs(qty));
  if (!(abs > 0)) return 0;
  if (kind === "merma" || kind === "reserva") return -abs;
  return abs;
}

export function clampStock(current: number, delta: number): { next: number; applied: number } {
  const next = roundQty(Math.max(0, current + delta));
  return { next, applied: roundQty(next - current) };
}

/** Precio de una unidad de la línea, a partir del precio del catálogo. */
export function pricePerLineUnit(
  catalogPrice: number | null | undefined,
  catalogUnit: IngredientUnit,
  lineUnit: IngredientUnit,
): number {
  if (catalogPrice == null || !Number.isFinite(catalogPrice)) return 0;
  const inCatalog = convertQuantity(1, lineUnit, catalogUnit);
  if (inCatalog == null) return roundQty(catalogPrice);
  return roundQty(catalogPrice * inCatalog);
}

export type OrderLineDraft = {
  ingredientId: number;
  quantity: number;
  unit: IngredientUnit;
  unitPrice: number;
};

export type ShoppingLineForOrder = {
  ingredientId: number;
  name: string;
  unit: IngredientUnit;
  quantity: number;
  unitPrice: number | null;
  supplierId: number | null;
  purchased: boolean;
  catalogUnit: IngredientUnit;
};

export function pendingOrderGroups(items: ShoppingLineForOrder[]): Array<{
  supplierId: number | null;
  lines: OrderLineDraft[];
}> {
  const map = new Map<string, { supplierId: number | null; lines: OrderLineDraft[] }>();
  for (const item of items) {
    if (item.purchased || !(item.quantity > 0)) continue;
    const key = item.supplierId == null ? "none" : String(item.supplierId);
    const group = map.get(key) ?? { supplierId: item.supplierId, lines: [] };
    group.lines.push({
      ingredientId: item.ingredientId,
      quantity: roundQty(item.quantity),
      unit: item.unit,
      unitPrice: pricePerLineUnit(item.unitPrice, item.catalogUnit, item.unit),
    });
    map.set(key, group);
  }
  return [...map.values()];
}

export function isOpenPurchaseStatus(status: string): boolean {
  return status === "borrador" || status === "enviada";
}

export type EventOperatingResult = {
  revenue: number;
  revenueSource: "aceptada" | "estimada" | "ninguna";
  estimatedFood: number;
  actualFood: number;
  otherCosts: number;
  actualCost: number;
  margin: number | null;
  marginPct: number | null;
  openOrders: number;
  invoiced: number;
};

export function buildEventOperatingResult(input: {
  acceptedRevenue: number;
  estimatedSale: number;
  estimatedFood: number;
  expenses: Array<{ amount: number }>;
  orders: Array<{
    status: string;
    invoiceTotal?: number | null;
    items: Array<{ receivedQty: number; unitPrice: number }>;
  }>;
}): EventOperatingResult {
  const actualFood = roundQty(
    input.orders
      .filter((order) => order.status !== "cancelada")
      .reduce(
        (sum, order) =>
          sum + order.items.reduce((lineSum, item) => lineSum + item.receivedQty * item.unitPrice, 0),
        0,
      ),
  );
  const otherCosts = roundQty(
    input.expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
  );
  const actualCost = roundQty(actualFood + otherCosts);
  const accepted = Math.max(0, input.acceptedRevenue || 0);
  const estimated = Math.max(0, input.estimatedSale || 0);
  const revenue = accepted > 0 ? accepted : estimated;
  const revenueSource = accepted > 0 ? "aceptada" : revenue > 0 ? "estimada" : "ninguna";
  const margin = revenue > 0 ? roundQty(revenue - actualCost) : null;
  const marginPct = margin != null && revenue > 0 ? Math.round((margin / revenue) * 100) : null;
  const openOrders = input.orders.filter((order) => isOpenPurchaseStatus(order.status)).length;
  const invoiced = roundQty(
    input.orders
      .filter((order) => order.status !== "cancelada" && order.invoiceTotal != null)
      .reduce((sum, order) => sum + (order.invoiceTotal ?? 0), 0),
  );
  return {
    revenue: roundQty(revenue),
    revenueSource,
    estimatedFood: roundQty(input.estimatedFood || 0),
    actualFood,
    otherCosts,
    actualCost,
    margin,
    marginPct,
    openOrders,
    invoiced,
  };
}
