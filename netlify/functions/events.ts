import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { clients, eventServices, events } from "../../db/schema";
import { buildReadiness } from "../../shared/eventReadiness";
import { error, json, now, readJson } from "./_shared/http";
import { denyIfUnauthorized } from "./_shared/auth";
import {
  applyMenuConsumption,
  eventDetail,
  loadReadiness,
  parseEventBody,
  prepareMenuConsumption,
  saveEventRelations,
} from "./_shared/events";

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
        setupTime: events.setupTime,
        serviceTime: events.serviceTime,
        packingItems: events.packingItems,
        clientName: clients.name,
      })
      .from(events)
      .innerJoin(clients, eq(events.clientId, clients.id))
      .orderBy(desc(events.eventDate));

    const readiness = await loadReadiness(rows);
    const withServices = await Promise.all(
      rows.map(async (row) => {
        const services = await db
          .select({ serviceType: eventServices.serviceType })
          .from(eventServices)
          .where(eq(eventServices.eventId, row.id));
        return {
          id: row.id,
          clientId: row.clientId,
          title: row.title,
          eventDate: row.eventDate,
          location: row.location,
          attendees: row.attendees,
          status: row.status,
          estimatedCost: row.estimatedCost,
          setupTime: row.setupTime,
          serviceTime: row.serviceTime,
          clientName: row.clientName,
          services: services.map((s) => s.serviceType),
          readiness: readiness.get(row.id) ?? buildReadiness({
            recipeCount: 0,
            packing: row.packingItems,
            purchased: 0,
            shoppingItemCount: 0,
            listExists: false,
          }),
        };
      }),
    );
    return json(withServices);
  }

  const body = await readJson(req);
  const parsed = parseEventBody(body);
  if ("error" in parsed) return error(parsed.error as string);

  const consumption = await prepareMenuConsumption({
    previousStatus: "nuevo",
    nextStatus: parsed.status,
    alreadyConsumed: false,
    allowShortStock: parsed.allowShortStock,
    recipeRows: parsed.recipeRows,
  });
  if (consumption.error) return error(consumption.error, 409);

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
      stockConsumed: consumption.stockConsumed,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  await saveEventRelations(created.id, [...parsed.services], [...parsed.recipeRows]);
  if (consumption.lines.length) await applyMenuConsumption(created.id, consumption.lines);
  return json(await eventDetail(created.id), 201);
};

export const config: Config = {
  path: "/api/events",
  method: ["GET", "POST"],
};
