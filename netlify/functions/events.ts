import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { clients, eventServices, events } from "../../db/schema";
import { error, json, now, readJson } from "./_shared/http";
import { denyIfUnauthorized } from "./_shared/auth";
import { eventDetail, parseEventBody, saveEventRelations } from "./_shared/events";

export default async (req: Request, _context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const rows = await db
      .select({
        id: events.id,
        clientId: events.clientId,
        title: events.title,
        eventDate: events.eventDate,
        location: events.location,
        attendees: events.attendees,
        status: events.status,
        estimatedCost: events.estimatedCost,
        clientName: clients.name,
      })
      .from(events)
      .innerJoin(clients, eq(events.clientId, clients.id))
      .orderBy(desc(events.eventDate));

    const withServices = await Promise.all(
      rows.map(async (row) => {
        const services = await db
          .select({ serviceType: eventServices.serviceType })
          .from(eventServices)
          .where(eq(eventServices.eventId, row.id));
        return { ...row, services: services.map((s) => s.serviceType) };
      }),
    );
    return json(withServices);
  }

  const body = await readJson(req);
  const parsed = parseEventBody(body);
  if ("error" in parsed) return error(parsed.error as string);

  const [created] = await db
    .insert(events)
    .values({
      clientId: parsed.clientId,
      title: parsed.title,
      eventDate: parsed.eventDate,
      location: parsed.location,
      attendees: parsed.attendees,
      status: parsed.status,
      dietaryRestrictions: parsed.dietaryRestrictions,
      notes: parsed.notes,
      estimatedCost: parsed.estimatedCost,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  await saveEventRelations(created.id, [...parsed.services], [...parsed.recipeRows]);
  return json(await eventDetail(created.id), 201);
};

export const config: Config = {
  path: "/api/events",
  method: ["GET", "POST"],
};
