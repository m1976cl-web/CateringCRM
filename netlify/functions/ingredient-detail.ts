import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { ingredientPrices, ingredients } from "../../db/schema";
import { isIngredientUnit } from "../../shared/types";
import { roundQty } from "../../shared/shopping";
import { asNumber, error, json, now, parseId, readJson } from "./_shared/http";
import { denyIfCannot, denyIfUnauthorized } from "./_shared/auth";
import { canDeleteCatalog, canEditPrices } from "../../shared/roles";
import { logMovement } from "./_shared/stock";

export default async (req: Request, context: Context) => {
  const denied =
    req.method === "GET"
      ? await denyIfUnauthorized(req)
      : req.method === "DELETE"
        ? await denyIfCannot(req, canDeleteCatalog)
        : await denyIfCannot(req, canEditPrices);
  if (denied) return denied;

  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const [row] = await db.select().from(ingredients).where(eq(ingredients.id, id)).limit(1);
    if (!row) return error("Ingrediente no encontrado", 404);
    const history = await db
      .select()
      .from(ingredientPrices)
      .where(eq(ingredientPrices.ingredientId, id));
    return json({
      ...row,
      priceHistory: history.map((h) => ({
        id: h.id,
        unitPrice: h.unitPrice,
        recordedAt: h.recordedAt,
      })),
    });
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const name = String(body.name ?? "").trim();
    if (!name) return error("El nombre del ingrediente es obligatorio");
    if (!isIngredientUnit(body.unit)) return error("Unidad inválida");

    const supplierId =
      body.supplierId === null || body.supplierId === undefined || body.supplierId === ""
        ? null
        : asNumber(body.supplierId, 0) || null;

    const [current] = await db.select().from(ingredients).where(eq(ingredients.id, id)).limit(1);
    if (!current) return error("Ingrediente no encontrado", 404);
    const nextPrice =
      body.unitPrice === null || body.unitPrice === undefined || body.unitPrice === ""
        ? null
        : asNumber(body.unitPrice);

    const desiredStock = Math.max(0, asNumber(body.stockQty, current.stockQty ?? 0));
    const stockDelta = roundQty(desiredStock - (current.stockQty ?? 0));
    const [updated] = await db
      .update(ingredients)
      .set({
        name,
        unit: body.unit,
        supplierId,
        unitPrice: nextPrice,
        stockQty: desiredStock,
        minStock: Math.max(0, asNumber(body.minStock, current.minStock ?? 0)),
        updatedAt: now(),
      })
      .where(eq(ingredients.id, id))
      .returning();

    if (!updated) return error("Ingrediente no encontrado", 404);
    if (stockDelta !== 0) {
      await logMovement({
        ingredientId: id,
        qty: stockDelta,
        kind: "ajuste",
        note: "Ajuste desde el catálogo",
      });
    }
    if (nextPrice != null && nextPrice !== (current.unitPrice ?? null)) {
      await db.insert(ingredientPrices).values({
        ingredientId: id,
        unitPrice: nextPrice,
        recordedAt: now(),
      });
    }
    const history = await db
      .select()
      .from(ingredientPrices)
      .where(eq(ingredientPrices.ingredientId, id));
    return json({
      ...updated,
      priceHistory: history.map((h) => ({
        id: h.id,
        unitPrice: h.unitPrice,
        recordedAt: h.recordedAt,
      })),
    });
  }

  if (req.method === "DELETE") {
    try {
      const [deleted] = await db.delete(ingredients).where(eq(ingredients.id, id)).returning();
      if (!deleted) return error("Ingrediente no encontrado", 404);
      return json({ ok: true });
    } catch {
      return error("No se puede eliminar: el ingrediente está en uso en recetas o listas", 409);
    }
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/ingredients/:id",
  method: ["GET", "PUT", "PATCH", "DELETE"],
};
