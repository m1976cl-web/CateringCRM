import type { Config, Context } from "@netlify/functions";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { ingredients, suppliers } from "../../db/schema";
import { isIngredientUnit } from "../../shared/types";
import { asNumber, error, json, now, readJson } from "./_shared/http";

export default async (req: Request, _context: Context) => {
  if (req.method === "GET") {
    const rows = await db
      .select({
        id: ingredients.id,
        name: ingredients.name,
        unit: ingredients.unit,
        supplierId: ingredients.supplierId,
        unitPrice: ingredients.unitPrice,
        stockQty: ingredients.stockQty,
        createdAt: ingredients.createdAt,
        updatedAt: ingredients.updatedAt,
        supplierName: suppliers.name,
      })
      .from(ingredients)
      .leftJoin(suppliers, eq(ingredients.supplierId, suppliers.id))
      .orderBy(asc(ingredients.name));
    return json(rows);
  }

  const body = await readJson(req);
  const name = String(body.name ?? "").trim();
  if (!name) return error("El nombre del ingrediente es obligatorio");
  if (!isIngredientUnit(body.unit)) return error("Unidad inválida");

  const supplierId =
    body.supplierId === null || body.supplierId === undefined || body.supplierId === ""
      ? null
      : asNumber(body.supplierId, 0) || null;

  const [created] = await db
    .insert(ingredients)
    .values({
      name,
      unit: body.unit,
      supplierId,
      unitPrice:
        body.unitPrice === null || body.unitPrice === undefined || body.unitPrice === ""
          ? null
          : asNumber(body.unitPrice),
      stockQty: asNumber(body.stockQty, 0),
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  return json(created, 201);
};

export const config: Config = {
  path: "/api/ingredients",
  method: ["GET", "POST"],
};
