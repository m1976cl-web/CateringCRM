import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { events } from "../../db/schema";
import { error, json, now, parseId, readJson } from "./_shared/http";
import { denyIfUnauthorized } from "./_shared/auth";
import { eventDetail, parseEventBody, saveEventRelations } from "./_shared/events";

export default async (req: Request, context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const row = await eventDetail(id);
    if (!row) return error("Evento no encontrado", 404);
    return json(row);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const parsed = parseEventBody(body);
    if ("error" in parsed) return error(parsed.error as string);

    const [updated] = await db
      .update(events)
      .set({
        clientId: parsed.clientId,
        title: parsed.title,
        eventDate: parsed.eventDate,
        location: parsed.location,
        attendees: parsed.attendees,
        status: parsed.status,
        dietaryRestrictions: parsed.dietaryRestrictions,
        dietaryTags: parsed.dietaryTags,
        setupTime: parsed.setupTime,
        serviceTime: parsed.serviceTime,
        endTime: parsed.endTime,
        venueContact: parsed.venueContact,
        venuePhone: parsed.venuePhone,
        packingItems: parsed.packingItems,
        expenses: parsed.expenses,
        staff: parsed.staff,
        notes: parsed.notes,
        estimatedCost: parsed.estimatedCost,
        updatedAt: now(),
      })
      .where(eq(events.id, id))
      .returning();

    if (!updated) return error("Evento no encontrado", 404);
    await saveEventRelations(id, [...parsed.services], [...parsed.recipeRows]);
    return json(await eventDetail(id));
  }

  if (req.method === "DELETE") {
    const [deleted] = await db.delete(events).where(eq(events.id, id)).returning();
    if (!deleted) return error("Evento no encontrado", 404);
    return json({ ok: true });
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/events/:id",
  method: ["GET", "PUT", "PATCH", "DELETE"],
};
