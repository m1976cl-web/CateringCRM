import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { clients, events, quotes } from "../../db/schema";
import { isQuoteStatus, quoteTotal } from "../../shared/types";
import { denyIfUnauthorized } from "./_shared/auth";
import { asNumber, asOptionalString, error, json, now, readJson } from "./_shared/http";
import { parseItems } from "./_shared/quotes";
import { syncEventFromQuote } from "./_shared/quoteLifecycle";
import { paymentsByQuoteIds, replaceQuotePayments } from "./_shared/quotePayments";
import { sumPayments } from "../../shared/quoteLifecycle";

export default async (req: Request, _context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

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
        foodCost: quotes.foodCost,
        createdAt: quotes.createdAt,
        eventTitle: events.title,
        clientName: clients.name,
        clientPhone: clients.phone,
      })
      .from(quotes)
      .innerJoin(events, eq(quotes.eventId, events.id))
      .innerJoin(clients, eq(events.clientId, clients.id))
      .orderBy(desc(quotes.quoteDate));
    const pays = await paymentsByQuoteIds(rows.map((r) => r.id));
    return json(
      rows.map((row) => ({
        ...row,
        foodCost: row.foodCost ?? 0,
        payments: pays.get(row.id) ?? [],
      })),
    );
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
      depositAmount: 0,
      foodCost: Math.max(0, asNumber(body.foodCost, 0)),
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  await replaceQuotePayments(created.id, body);
  await syncEventFromQuote(eventId, body.status);
  const pays = await paymentsByQuoteIds([created.id]);
  const payments = pays.get(created.id) ?? [];
  return json({ ...created, depositAmount: sumPayments(payments), payments }, 201);
};

export const config: Config = {
  path: "/api/quotes",
  method: ["GET", "POST"],
};
