import type { Config, Context } from "@netlify/functions";
import { and, count, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "../../db";
import { clients, events, quotes, recipes, shoppingLists } from "../../db/schema";
import { denyIfUnauthorized } from "./_shared/auth";

export default async (req: Request, _context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [clientCount] = await db.select({ value: count() }).from(clients);
  const [recipeCount] = await db.select({ value: count() }).from(recipes);
  const [eventCount] = await db.select({ value: count() }).from(events);
  const [quoteCount] = await db.select({ value: count() }).from(quotes);
  const [pendingLists] = await db
    .select({ value: count() })
    .from(shoppingLists)
    .where(eq(shoppingLists.status, "pendiente"));

  const upcoming = await db
    .select({
      id: events.id,
      title: events.title,
      eventDate: events.eventDate,
      attendees: events.attendees,
      status: events.status,
      clientId: events.clientId,
      clientName: clients.name,
    })
    .from(events)
    .innerJoin(clients, eq(events.clientId, clients.id))
    .where(
      and(
        gte(events.eventDate, now),
        lt(events.eventDate, in14),
        ne(events.status, "cancelado"),
      ),
    )
    .orderBy(events.eventDate)
    .limit(10);

  const confirmedSoon = upcoming.filter((e) => e.status === "confirmado").length;
  const needsAttention = upcoming.filter(
    (e) => e.status === "borrador" || e.status === "cotizado",
  ).length;

  return Response.json({
    counts: {
      clients: clientCount?.value ?? 0,
      recipes: recipeCount?.value ?? 0,
      events: eventCount?.value ?? 0,
      quotes: quoteCount?.value ?? 0,
      pendingShoppingLists: pendingLists?.value ?? 0,
    },
    upcoming,
    alerts: {
      confirmedSoon,
      needsAttention,
    },
  });
};

export const config: Config = {
  path: "/api/dashboard",
  method: ["GET"],
};
