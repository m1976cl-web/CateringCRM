import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { clients, events, quotes } from "../../db/schema";
import { isQuoteStatus, quoteTotal } from "../../shared/types";
import { normalizeDeposit } from "../../shared/quoteLifecycle";
import { asNumber, asOptionalString, error, json, now, readJson } from "./_shared/http";
import { parseItems } from "./_shared/quotes";
import { syncEventFromQuote } from "./_shared/quoteLifecycle";

export default async (req: Request, _context: Context) => {
  if (req.method === "GET") {
    const rows = await db
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
        createdAt: quotes.createdAt,
        eventTitle: events.title,
        clientName: clients.name,
      })
      .from(quotes)
      .innerJoin(events, eq(quotes.eventId, events.id))
      .innerJoin(clients, eq(events.clientId, clients.id))
      .orderBy(desc(quotes.quoteDate));
    return json(rows);
  }

  const body = await readJson(req);
  const eventId = asNumber(body.eventId, 0);
  if (!eventId) return error("Debes vincular la cotización a un evento");
  if (!isQuoteStatus(body.status)) return error("Estado de cotización inválido");

  const items = parseItems(body.items);
  if (!items || items.length === 0) return error("Agrega al menos un ítem a la cotización");

  const quoteDate = body.quoteDate ? new Date(String(body.quoteDate)) : now();
  if (Number.isNaN(quoteDate.getTime())) return error("Fecha inválida");

  const [created] = await db
    .insert(quotes)
    .values({
      eventId,
      quoteNumber: asOptionalString(body.quoteNumber),
      quoteDate,
      items,
      total: quoteTotal(items),
      notes: asOptionalString(body.notes),
      status: body.status,
      depositAmount: normalizeDeposit(body.depositAmount),
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  await syncEventFromQuote(eventId, body.status);

  return json(created, 201);
};

export const config: Config = {
  path: "/api/quotes",
  method: ["GET", "POST"],
};
