import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { ingredients, stockMovements } from "../../../db/schema";
import { clampStock, type StockMovementKind } from "../../../shared/procurement";
import { now } from "./http";

export async function logMovement(input: {
  ingredientId: number;
  qty: number;
  kind: StockMovementKind;
  note?: string | null;
  eventId?: number | null;
  purchaseOrderId?: number | null;
}): Promise<void> {
  if (input.qty === 0) return;
  await db.insert(stockMovements).values({
    ingredientId: input.ingredientId,
    qty: input.qty,
    kind: input.kind,
    note: input.note ?? null,
    eventId: input.eventId ?? null,
    purchaseOrderId: input.purchaseOrderId ?? null,
    createdAt: now(),
  });
}

/** Suma un delta en la unidad del catálogo y anota la cantidad realmente aplicada. */
export async function applyCatalogDelta(input: {
  ingredientId: number;
  delta: number;
  kind: StockMovementKind;
  note?: string | null;
  eventId?: number | null;
  purchaseOrderId?: number | null;
}): Promise<number> {
  const [ing] = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.id, input.ingredientId))
    .limit(1);
  if (!ing) throw new Error("Ingrediente no encontrado");
  const { next, applied } = clampStock(ing.stockQty ?? 0, input.delta);
  if (applied === 0) return 0;
  await db
    .update(ingredients)
    .set({ stockQty: next, updatedAt: now() })
    .where(eq(ingredients.id, ing.id));
  await logMovement({ ...input, qty: applied });
  return applied;
}
