import { eq } from "drizzle-orm";
import { db } from "../../../db";
import {
  clients,
  eventRecipes,
  eventServices,
  events,
  recipes,
} from "../../../db/schema";
import { isEventStatus, isServiceType, type ServiceType } from "../../../shared/types";
import {
  defaultPackingItems,
  parseDietaryTags,
  parseExpenses,
  parsePackingItems,
  parseStaff,
  parseTimeHm,
} from "../../../shared/ops";
import { asNumber, asOptionalString } from "./http";

export async function eventDetail(eventId: number) {
  const [row] = await db
    .select({
      id: events.id,
      clientId: events.clientId,
      title: events.title,
      eventDate: events.eventDate,
      location: events.location,
      attendees: events.attendees,
      status: events.status,
      dietaryRestrictions: events.dietaryRestrictions,
      dietaryTags: events.dietaryTags,
      setupTime: events.setupTime,
      serviceTime: events.serviceTime,
      endTime: events.endTime,
      venueContact: events.venueContact,
      venuePhone: events.venuePhone,
      packingItems: events.packingItems,
      expenses: events.expenses,
      staff: events.staff,
      notes: events.notes,
      estimatedCost: events.estimatedCost,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
      clientName: clients.name,
    })
    .from(events)
    .innerJoin(clients, eq(events.clientId, clients.id))
    .where(eq(events.id, eventId))
    .limit(1);

  if (!row) return null;

  const services = await db
    .select({ serviceType: eventServices.serviceType })
    .from(eventServices)
    .where(eq(eventServices.eventId, eventId));

  const menu = await db
    .select({
      id: eventRecipes.id,
      recipeId: eventRecipes.recipeId,
      serviceType: eventRecipes.serviceType,
      portions: eventRecipes.portions,
      recipeName: recipes.name,
    })
    .from(eventRecipes)
    .innerJoin(recipes, eq(eventRecipes.recipeId, recipes.id))
    .where(eq(eventRecipes.eventId, eventId));

  return {
    ...row,
    dietaryTags: parseDietaryTags(row.dietaryTags),
    packingItems: parsePackingItems(row.packingItems).length
      ? parsePackingItems(row.packingItems)
      : defaultPackingItems(),
    expenses: parseExpenses(row.expenses),
    staff: parseStaff(row.staff),
    services: services.map((s) => s.serviceType),
    recipes: menu,
  };
}

export async function saveEventRelations(
  eventId: number,
  services: ServiceType[],
  recipeRows: Array<{ recipeId: number; serviceType: ServiceType; portions: number }>,
) {
  await db.delete(eventServices).where(eq(eventServices.eventId, eventId));
  await db.delete(eventRecipes).where(eq(eventRecipes.eventId, eventId));

  for (const serviceType of services) {
    await db.insert(eventServices).values({ eventId, serviceType });
  }
  for (const r of recipeRows) {
    await db.insert(eventRecipes).values({
      eventId,
      recipeId: r.recipeId,
      serviceType: r.serviceType,
      portions: r.portions,
    });
  }
}

export function parseEventBody(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const clientId = asNumber(body.clientId, 0);
  const attendees = Math.max(1, Math.floor(asNumber(body.attendees, 1)));
  const eventDateRaw = body.eventDate;
  const status = body.status;

  if (!title) return { error: "El título del evento es obligatorio" } as const;
  if (!clientId) return { error: "Debes elegir un cliente" } as const;
  if (!eventDateRaw) return { error: "La fecha del evento es obligatoria" } as const;
  if (!isEventStatus(status)) return { error: "Estado inválido" } as const;

  const eventDate = new Date(String(eventDateRaw));
  if (Number.isNaN(eventDate.getTime())) return { error: "Fecha inválida" } as const;

  const servicesRaw = Array.isArray(body.services) ? body.services : [];
  const services = servicesRaw.filter(isServiceType);
  if (services.length === 0) {
    return { error: "Elige al menos un servicio (desayuno, almuerzo…)" } as const;
  }

  const recipesRaw = Array.isArray(body.recipes) ? body.recipes : [];
  const recipeRows: Array<{ recipeId: number; serviceType: ServiceType; portions: number }> = [];
  for (const raw of recipesRaw) {
    const item = raw as Record<string, unknown>;
    const recipeId = asNumber(item.recipeId, 0);
    const portions = Math.max(1, Math.floor(asNumber(item.portions, attendees)));
    if (recipeId > 0 && isServiceType(item.serviceType)) {
      recipeRows.push({ recipeId, serviceType: item.serviceType, portions });
    }
  }

  return {
    title,
    clientId,
    attendees,
    eventDate,
    status,
    location: asOptionalString(body.location),
    dietaryRestrictions: asOptionalString(body.dietaryRestrictions),
    dietaryTags: parseDietaryTags(body.dietaryTags),
    setupTime: parseTimeHm(body.setupTime),
    serviceTime: parseTimeHm(body.serviceTime),
    endTime: parseTimeHm(body.endTime),
    venueContact: asOptionalString(body.venueContact),
    venuePhone: asOptionalString(body.venuePhone),
    packingItems: parsePackingItems(body.packingItems).length
      ? parsePackingItems(body.packingItems)
      : defaultPackingItems(),
    expenses: parseExpenses(body.expenses),
    staff: parseStaff(body.staff),
    notes: asOptionalString(body.notes),
    estimatedCost:
      body.estimatedCost === null || body.estimatedCost === undefined || body.estimatedCost === ""
        ? null
        : asNumber(body.estimatedCost),
    services,
    recipeRows,
  } as const;
}
