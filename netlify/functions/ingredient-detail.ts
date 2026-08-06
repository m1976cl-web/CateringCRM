import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { ingredients } from "../../db/schema";
import { isIngredientUnit } from "../../shared/types";
import { asNumber, error, json, now, parseId, readJson } from "./_shared/http";

export default async (req: Request, context: Context) => {
  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const [row] = await db.select().from(ingredients).where(eq(ingredients.id, id)).limit(1);
    if (!row) return error("Ingrediente no encontrado", 404);
    return json(row);
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

    const [updated] = await db
      .update(ingredients)
      .set({
        name,
        unit: body.unit,
        supplierId,
        unitPrice:
          body.unitPrice === null || body.unitPrice === undefined || body.unitPrice === ""
            ? null
            : asNumber(body.unitPrice),
        stockQty: asNumber(body.stockQty, 0),
        updatedAt: now(),
      })
      .where(eq(ingredients.id, id))
      .returning();

    if (!updated) return error("Ingrediente no encontrado", 404);
    return json(updated);
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
