import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { suppliers } from "../../db/schema";
import { asOptionalString, error, json, now, parseId, readJson } from "./_shared/http";

export default async (req: Request, context: Context) => {
  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!row) return error("Proveedor no encontrado", 404);
    return json(row);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const name = String(body.name ?? "").trim();
    if (!name) return error("El nombre del proveedor es obligatorio");

    const [updated] = await db
      .update(suppliers)
      .set({
        name,
        contactName: asOptionalString(body.contactName),
        phone: asOptionalString(body.phone),
        email: asOptionalString(body.email),
        notes: asOptionalString(body.notes),
        updatedAt: now(),
      })
      .where(eq(suppliers.id, id))
      .returning();

    if (!updated) return error("Proveedor no encontrado", 404);
    return json(updated);
  }

  if (req.method === "DELETE") {
    const [deleted] = await db.delete(suppliers).where(eq(suppliers.id, id)).returning();
    if (!deleted) return error("Proveedor no encontrado", 404);
    return json({ ok: true });
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/suppliers/:id",
  method: ["GET", "PUT", "PATCH", "DELETE"],
};
