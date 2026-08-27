import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { clients } from "../../db/schema";
import { asOptionalString, error, json, now, parseId, readJson } from "./_shared/http";
import { denyIfUnauthorized } from "./_shared/auth";

export default async (req: Request, context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    if (!row) return error("Cliente no encontrado", 404);
    return json(row);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const name = String(body.name ?? "").trim();
    if (!name) return error("El nombre del cliente es obligatorio");

    const [updated] = await db
      .update(clients)
      .set({
        name,
        phone: asOptionalString(body.phone),
        email: asOptionalString(body.email),
        company: asOptionalString(body.company),
        notes: asOptionalString(body.notes),
        updatedAt: now(),
      })
      .where(eq(clients.id, id))
      .returning();

    if (!updated) return error("Cliente no encontrado", 404);
    return json(updated);
  }

  if (req.method === "DELETE") {
    const [deleted] = await db.delete(clients).where(eq(clients.id, id)).returning();
    if (!deleted) return error("Cliente no encontrado", 404);
    return json({ ok: true });
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/clients/:id",
  method: ["GET", "PUT", "PATCH", "DELETE"],
};
