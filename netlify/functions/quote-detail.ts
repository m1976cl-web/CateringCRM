import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { clients, events, quotes } from "../../db/schema";
import { isQuoteStatus, quoteTotal } from "../../shared/types";
import { denyIfUnauthorized } from "./_shared/auth";
import { asNumber, asOptionalString, error, json, now, parseId, readJson } from "./_shared/http";
import { parseItems } from "./_shared/quotes";
import { syncEventFromQuote } from "./_shared/quoteLifecycle";
import { paymentsForQuote, replaceQuotePayments } from "./_shared/quotePayments";

async function quoteDetail(id: number) {
  const [row] = await db
    .select({
      id: quotes.id,
      eventId: quotes.eventId,
      quoteNumber: quotes.quoteNumber,
      quoteDate: quotes.quoteDate,
      items: quotes.items,
      total: quotes.total,
      notes: quotes.notes,
      status: quotes.status,
      depositAmount: quotes.depositAmount,
      foodCost: quotes.foodCost,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt,
      eventTitle: events.title,
      eventDate: events.eventDate,
      attendees: events.attendees,
      location: events.location,
      clientName: clients.name,
      clientEmail: clients.email,
      clientPhone: clients.phone,
      clientCompany: clients.company,
    })
    .from(quotes)
    .innerJoin(events, eq(quotes.eventId, events.id))
    .innerJoin(clients, eq(events.clientId, clients.id))
    .where(eq(quotes.id, id))
    .limit(1);
  if (!row) return null;
  const payments = await paymentsForQuote(id);
  return { ...row, foodCost: row.foodCost ?? 0, payments };
}

export default async (req: Request, context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const row = await quoteDetail(id);
    if (!row) return error("Cotización no encontrada", 404);
    return json(row);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const eventId = asNumber(body.eventId, 0);
    if (!eventId) return error("Debes vincular la cotización a un evento");
    if (!isQuoteStatus(body.status)) return error("Estado de cotización inválido");

    const items = parseItems(body.items);
    if (!items || items.length === 0) return error("Agrega al menos un ítem a la cotización");

    const quoteDate = body.quoteDate ? new Date(String(body.quoteDate)) : now();
    if (Number.isNaN(quoteDate.getTime())) return error("Fecha inválida");

    const [updated] = await db
      .update(quotes)
      .set({
        eventId,
        quoteNumber: asOptionalString(body.quoteNumber),
        quoteDate,
        items,
        total: quoteTotal(items),
        notes: asOptionalString(body.notes),
        status: body.status,
        foodCost: Math.max(0, asNumber(body.foodCost, 0)),
        updatedAt: now(),
      })
      .where(eq(quotes.id, id))
      .returning();

    if (!updated) return error("Cotización no encontrada", 404);
    await replaceQuotePayments(id, body);
    await syncEventFromQuote(eventId, body.status);
    return json(await quoteDetail(id));
  }

  if (req.method === "DELETE") {
    const [deleted] = await db.delete(quotes).where(eq(quotes.id, id)).returning();
    if (!deleted) return error("Cotización no encontrada", 404);
    return json({ ok: true });
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/quotes/:id",
  method: ["GET", "PUT", "PATCH", "DELETE"],
};
