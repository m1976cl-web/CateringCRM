import type { Config } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { events, ingredients, stockMovements } from "../../db/schema";
import {
  isStockMovementKind,
  movementDelta,
  type StockMovementKind,
} from "../../shared/procurement";
import { denyIfUnauthorized } from "./_shared/auth";
import { asNumber, error, json, parseId, readJson } from "./_shared/http";
import { applyCatalogDelta } from "./_shared/stock";

function movementQuery() {
  return db
    .select({
      id: stockMovements.id,
      ingredientId: stockMovements.ingredientId,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      qty: stockMovements.qty,
      kind: stockMovements.kind,
      note: stockMovements.note,
      eventId: stockMovements.eventId,
      eventTitle: events.title,
      purchaseOrderId: stockMovements.purchaseOrderId,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(ingredients, eq(stockMovements.ingredientId, ingredients.id))
    .leftJoin(events, eq(stockMovements.eventId, events.id));
}

async function listMovements(ingredientId: number | null) {
  const filtered = ingredientId
    ? movementQuery().where(eq(stockMovements.ingredientId, ingredientId))
    : movementQuery();
  return filtered.orderBy(desc(stockMovements.createdAt)).limit(50);
}

export default async (req: Request) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const ingredientId = parseId(new URL(req.url).searchParams.get("ingredientId") ?? undefined);
    return json(await listMovements(ingredientId));
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const ingredientId = asNumber(body.ingredientId, 0);
    if (!Number.isInteger(ingredientId) || ingredientId <= 0) return error("Ingrediente no válido");
    if (!isStockMovementKind(body.kind)) return error("Tipo de movimiento no válido");
    const kind = body.kind as StockMovementKind;
    const delta = movementDelta(kind, asNumber(body.qty, 0));
    if (delta === 0) return error("La cantidad debe ser distinta de cero");
    const eventId = parseId(body.eventId == null || body.eventId === "" ? undefined : String(body.eventId));
    const note = body.note == null || String(body.note).trim() === "" ? null : String(body.note).trim();
    try {
      const applied = await applyCatalogDelta({ ingredientId, delta, kind, note, eventId });
      if (applied === 0) return error("El stock no cambió. Revisa la cantidad.");
    } catch (err) {
      return error(err instanceof Error ? err.message : "No se pudo registrar el movimiento");
    }
    const rows = await listMovements(ingredientId);
    return json(rows[0] ?? null, 201);
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/stock-movements",
  method: ["GET", "POST"],
};
