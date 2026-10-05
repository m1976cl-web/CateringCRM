import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import {
  events,
  ingredients,
  purchaseOrderItems,
  purchaseOrders,
  shoppingListItems,
  shoppingLists,
  suppliers,
} from "../../../db/schema";
import { isOpenPurchaseStatus, pendingOrderGroups } from "../../../shared/procurement";
import { convertQuantity, roundQty } from "../../../shared/shopping";
import type { IngredientUnit } from "../../../shared/types";
import { asNumber, now } from "./http";
import { applyCatalogDelta } from "./stock";

export async function loadOrders(eventId: number | null) {
  const rows = eventId
    ? await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.eventId, eventId))
        .orderBy(desc(purchaseOrders.orderedAt))
    : await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.orderedAt)).limit(100);
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const items = await db
    .select({
      id: purchaseOrderItems.id,
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      ingredientId: purchaseOrderItems.ingredientId,
      name: ingredients.name,
      quantity: purchaseOrderItems.quantity,
      unit: purchaseOrderItems.unit,
      unitPrice: purchaseOrderItems.unitPrice,
      receivedQty: purchaseOrderItems.receivedQty,
    })
    .from(purchaseOrderItems)
    .innerJoin(ingredients, eq(purchaseOrderItems.ingredientId, ingredients.id))
    .where(inArray(purchaseOrderItems.purchaseOrderId, ids));

  const supplierIds = [...new Set(rows.map((row) => row.supplierId).filter((id): id is number => id != null))];
  const eventIds = [...new Set(rows.map((row) => row.eventId).filter((id): id is number => id != null))];
  const supplierRows = supplierIds.length
    ? await db
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(inArray(suppliers.id, supplierIds))
    : [];
  const eventRows = eventIds.length
    ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds))
    : [];
  const supplierName = new Map(supplierRows.map((row) => [row.id, row.name]));
  const eventTitle = new Map(eventRows.map((row) => [row.id, row.title]));

  return rows.map((row) => ({
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplierId ? (supplierName.get(row.supplierId) ?? null) : null,
    eventId: row.eventId,
    eventTitle: row.eventId ? (eventTitle.get(row.eventId) ?? null) : null,
    status: row.status,
    invoiceNumber: row.invoiceNumber,
    invoiceTotal: row.invoiceTotal,
    notes: row.notes,
    orderedAt: row.orderedAt,
    receivedAt: row.receivedAt,
    items: items
      .filter((item) => item.purchaseOrderId === row.id)
      .map((item) => ({
        id: item.id,
        ingredientId: item.ingredientId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit as IngredientUnit,
        unitPrice: item.unitPrice,
        receivedQty: item.receivedQty,
      })),
  }));
}

export async function loadOrder(id: number) {
  const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!row) return null;
  const orders = await loadOrders(row.eventId);
  return orders.find((order) => order.id === id) ?? (await loadOrders(null)).find((order) => order.id === id) ?? null;
}

export async function createOrdersFromShopping(eventId: number) {
  const open = await db
    .select({ status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.eventId, eventId));
  if (open.some((row) => isOpenPurchaseStatus(row.status))) {
    throw new Error("Ya hay una orden abierta para este evento. Recíbela o cancélala antes de crear otra.");
  }

  const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.eventId, eventId)).limit(1);
  if (!list) throw new Error("No hay lista de compras. Genérala primero.");

  const lines = await db
    .select({
      ingredientId: shoppingListItems.ingredientId,
      name: ingredients.name,
      quantity: shoppingListItems.quantity,
      unit: shoppingListItems.unit,
      purchased: shoppingListItems.purchased,
      unitPrice: ingredients.unitPrice,
      supplierId: ingredients.supplierId,
      catalogUnit: ingredients.unit,
    })
    .from(shoppingListItems)
    .innerJoin(ingredients, eq(shoppingListItems.ingredientId, ingredients.id))
    .where(eq(shoppingListItems.shoppingListId, list.id));

  const groups = pendingOrderGroups(
    lines.map((line) => ({
      ingredientId: line.ingredientId,
      name: line.name,
      unit: line.unit as IngredientUnit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      supplierId: line.supplierId,
      purchased: line.purchased,
      catalogUnit: line.catalogUnit,
    })),
  );
  if (!groups.length) throw new Error("No hay ítems pendientes para ordenar.");

  const createdIds: number[] = [];
  for (const group of groups) {
    const [order] = await db
      .insert(purchaseOrders)
      .values({
        supplierId: group.supplierId,
        eventId,
        status: "enviada",
        orderedAt: now(),
        createdAt: now(),
        updatedAt: now(),
      })
      .returning();
    for (const line of group.lines) {
      await db.insert(purchaseOrderItems).values({
        purchaseOrderId: order.id,
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        receivedQty: 0,
      });
    }
    createdIds.push(order.id);
  }

  const orders = await loadOrders(eventId);
  return orders.filter((order) => createdIds.includes(order.id));
}

export async function cancelOrder(id: number) {
  const order = await loadOrder(id);
  if (!order) throw new Error("Orden no encontrada");
  if (order.status === "cancelada") return order;
  if (order.items.some((item) => item.receivedQty > 0)) {
    throw new Error("Ya hay cantidades recibidas. No se puede cancelar.");
  }
  await db
    .update(purchaseOrders)
    .set({ status: "cancelada", updatedAt: now() })
    .where(eq(purchaseOrders.id, id));
  return loadOrder(id);
}

export async function receiveOrder(
  id: number,
  body: { invoiceNumber?: unknown; invoiceTotal?: unknown; items?: Array<{ id?: unknown; receivedQty?: unknown }> },
) {
  const order = await loadOrder(id);
  if (!order) throw new Error("Orden no encontrada");
  if (order.status === "cancelada") throw new Error("La orden está cancelada");
  if (!order.items.length) throw new Error("La orden no tiene ítems");

  const requested = new Map<number, number>();
  if (Array.isArray(body.items)) {
    for (const patch of body.items) {
      const itemId = asNumber(patch.id, 0);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;
      requested.set(itemId, asNumber(patch.receivedQty, 0));
    }
  }

  const [list] = order.eventId
    ? await db.select().from(shoppingLists).where(eq(shoppingLists.eventId, order.eventId)).limit(1)
    : [];

  let receivedSomething = false;
  for (const item of order.items) {
    const target = requested.has(item.id) ? (requested.get(item.id) as number) : item.quantity;
    if (target + 1e-9 < item.receivedQty) {
      throw new Error(`No se puede recibir menos de lo ya ingresado en ${item.name}`);
    }
    const add = roundQty(target - item.receivedQty);
    if (!(add > 0)) continue;

    let alreadyPurchased = false;
    if (list) {
      const [line] = await db
        .select({ purchased: shoppingListItems.purchased })
        .from(shoppingListItems)
        .where(
          and(eq(shoppingListItems.shoppingListId, list.id), eq(shoppingListItems.ingredientId, item.ingredientId)),
        )
        .limit(1);
      alreadyPurchased = Boolean(line?.purchased);
    }
    const skipStock = alreadyPurchased && item.receivedQty === 0;
    if (!skipStock) {
      const [ing] = await db
        .select({ unit: ingredients.unit })
        .from(ingredients)
        .where(eq(ingredients.id, item.ingredientId))
        .limit(1);
      if (!ing) throw new Error("Ingrediente no encontrado");
      const delta = convertQuantity(add, item.unit as IngredientUnit, ing.unit);
      if (delta == null) {
        throw new Error(`No se puede sumar ${item.name}: la unidad de la orden no coincide con el catálogo`);
      }
      await applyCatalogDelta({
        ingredientId: item.ingredientId,
        delta,
        kind: "recepcion",
        note: `Recepción orden #${id}`,
        eventId: order.eventId,
        purchaseOrderId: id,
      });
    }
    await db
      .update(purchaseOrderItems)
      .set({ receivedQty: roundQty(item.receivedQty + add) })
      .where(eq(purchaseOrderItems.id, item.id));
    if (list) {
      await db
        .update(shoppingListItems)
        .set({ purchased: true })
        .where(
          and(eq(shoppingListItems.shoppingListId, list.id), eq(shoppingListItems.ingredientId, item.ingredientId)),
        );
    }
    receivedSomething = true;
  }

  if (!receivedSomething) throw new Error("Indica cuánto recibiste");

  const fresh = await loadOrder(id);
  if (!fresh) throw new Error("Orden no encontrada");
  const complete = fresh.items.every((item) => item.receivedQty + 1e-9 >= item.quantity);
  const invoiceNumber =
    body.invoiceNumber == null || String(body.invoiceNumber).trim() === ""
      ? fresh.invoiceNumber
      : String(body.invoiceNumber).trim();
  const invoiceTotal =
    body.invoiceTotal == null || body.invoiceTotal === ""
      ? fresh.invoiceTotal
      : asNumber(body.invoiceTotal, 0);
  await db
    .update(purchaseOrders)
    .set({
      status: complete ? "recibida" : "enviada",
      receivedAt: complete ? now() : fresh.receivedAt,
      invoiceNumber,
      invoiceTotal,
      updatedAt: now(),
    })
    .where(eq(purchaseOrders.id, id));
  return loadOrder(id);
}
