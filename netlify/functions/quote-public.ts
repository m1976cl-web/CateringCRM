import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { clients, events, quotes } from "../../db/schema";
import { error, json } from "./_shared/http";
import { syncEventFromQuote } from "./_shared/quoteLifecycle";

async function loadPublic(token: string) {
  const [row] = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      quoteDate: quotes.quoteDate,
      items: quotes.items,
      total: quotes.total,
      notes: quotes.notes,
      status: quotes.status,
      version: quotes.version,
      eventTitle: events.title,
      eventDate: events.eventDate,
      location: events.location,
      attendees: events.attendees,
      clientName: clients.name,
      clientCompany: clients.company,
    })
    .from(quotes)
    .innerJoin(events, eq(quotes.eventId, events.id))
    .innerJoin(clients, eq(events.clientId, clients.id))
    .where(eq(quotes.publicToken, token))
    .limit(1);
  return row ?? null;
}

export default async (req: Request, context: Context) => {
  const token = String(context.params?.token ?? "").trim();
  if (!token) return error("Enlace no válido", 400);

  if (req.method === "GET") {
    const row = await loadPublic(token);
    if (!row) return error("Cotización no encontrada", 404);
    return json(row);
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const [current] = await db
      .select({ id: quotes.id, eventId: quotes.eventId })
      .from(quotes)
      .where(eq(quotes.publicToken, token))
      .limit(1);
    if (!current) return error("Cotización no encontrada", 404);
    const action = body.action;
    if (action !== "accept" && action !== "reject") return error("Acción no válida");
    const status = action === "accept" ? "aceptada" : "rechazada";
    await db.update(quotes).set({ status }).where(eq(quotes.id, current.id));
    if (status === "aceptada") await syncEventFromQuote(current.eventId, status);
    const row = await loadPublic(token);
    return json(row);
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/public/quotes/:token",
  method: ["GET", "POST"],
};
