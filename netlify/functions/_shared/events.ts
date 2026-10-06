import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import {
  clients,
  eventRecipes,
  eventServices,
  events,
  recipes,
  shoppingListItems,
  shoppingLists,
} from "../../../db/schema";
import { buildReadiness, type EventReadiness } from "../../../shared/eventReadiness";
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

  const readiness =
    (await loadReadiness([{ id: row.id, packingItems: row.packingItems }])).get(row.id) ??
    buildReadiness({
      recipeCount: menu.length,
      packing: row.packingItems,
      purchased: 0,
      shoppingItemCount: 0,
      listExists: false,
    });

  return {
    ...row,
    readiness,
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

export async function loadReadiness(
  rows: Array<{ id: number; packingItems: unknown }>,
): Promise<Map<number, EventReadiness>> {
  const map = new Map<number, EventReadiness>();
  if (!rows.length) return map;
  const ids = rows.map((row) => row.id);
  const [recipeRows, lists] = await Promise.all([
    db
      .select({ eventId: eventRecipes.eventId })
      .from(eventRecipes)
      .where(inArray(eventRecipes.eventId, ids)),
    db
      .select({ id: shoppingLists.id, eventId: shoppingLists.eventId })
      .from(shoppingLists)
      .where(inArray(shoppingLists.eventId, ids)),
  ]);
  const recipeCount = new Map<number, number>();
  for (const recipe of recipeRows) {
    recipeCount.set(recipe.eventId, (recipeCount.get(recipe.eventId) ?? 0) + 1);
  }
  const listByEvent = new Map(lists.map((list) => [list.eventId, list.id]));
  const listIds = lists.map((list) => list.id);
  const items = listIds.length
    ? await db
        .select({
          shoppingListId: shoppingListItems.shoppingListId,
          purchased: shoppingListItems.purchased,
        })
        .from(shoppingListItems)
        .where(inArray(shoppingListItems.shoppingListId, listIds))
    : [];
  const itemStats = new Map<number, { total: number; purchased: number }>();
  for (const item of items) {
    const stat = itemStats.get(item.shoppingListId) ?? { total: 0, purchased: 0 };
    stat.total += 1;
    if (item.purchased) stat.purchased += 1;
    itemStats.set(item.shoppingListId, stat);
  }
  for (const row of rows) {
    const listId = listByEvent.get(row.id);
    const stat = listId != null ? itemStats.get(listId) : undefined;
    map.set(
      row.id,
      buildReadiness({
        recipeCount: recipeCount.get(row.id) ?? 0,
        packing: row.packingItems,
        purchased: stat?.purchased ?? 0,
        shoppingItemCount: stat?.total ?? 0,
        listExists: listId != null,
      }),
    );
  }
  return map;
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
