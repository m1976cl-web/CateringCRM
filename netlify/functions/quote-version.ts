import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { quotes } from "../../db/schema";
import { randomToken } from "../../shared/password";
import { denyIfUnauthorized } from "./_shared/auth";
import { error, json, now, parseId } from "./_shared/http";
import { paymentsForQuote, replaceQuotePayments } from "./_shared/quotePayments";

export default async (req: Request, context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;
  if (req.method !== "POST") return error("Método no permitido", 405);

  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);
  const [source] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!source) return error("Cotización no encontrada", 404);

  const siblings = await db
    .select({ version: quotes.version })
    .from(quotes)
    .where(eq(quotes.eventId, source.eventId))
    .orderBy(desc(quotes.version))
    .limit(1);
  const nextVersion = (siblings[0]?.version ?? source.version ?? 1) + 1;

  const [created] = await db
    .insert(quotes)
    .values({
      eventId: source.eventId,
      quoteNumber: source.quoteNumber ? `${source.quoteNumber}-v${nextVersion}` : null,
      quoteDate: now(),
      items: source.items,
      total: source.total,
      notes: source.notes,
      status: "borrador",
      depositAmount: 0,
      foodCost: source.foodCost,
      version: nextVersion,
      parentQuoteId: source.id,
      publicToken: randomToken().slice(0, 32),
      dueDate: source.dueDate,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  await replaceQuotePayments(created.id, { payments: [] });
  const payments = await paymentsForQuote(created.id);
  return json({ ...created, payments }, 201);
};

export const config: Config = {
  path: "/api/quotes/:id/version",
  method: ["POST"],
};
