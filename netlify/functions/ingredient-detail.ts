import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { ingredientPrices, ingredients } from "../../db/schema";
import { isIngredientUnit } from "../../shared/types";
import { asNumber, error, json, now, parseId, readJson } from "./_shared/http";
import { denyIfUnauthorized } from "./_shared/auth";

export default async (req: Request, context: Context) => {
  const denied = await denyIfUnauthorized(req);
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

    const [updated] = await db
      .update(ingredients)
      .set({
        name,
        unit: body.unit,
        supplierId,
        unitPrice: nextPrice,
        stockQty: asNumber(body.stockQty, 0),
        updatedAt: now(),
      })
      .where(eq(ingredients.id, id))
      .returning();

    if (!updated) return error("Ingrediente no encontrado", 404);
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
