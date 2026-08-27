import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { events } from "../../../db/schema";
import { eventStatusAfterQuote } from "../../../shared/quoteLifecycle";
import type { QuoteStatus } from "../../../shared/types";
import { now } from "./http";

export async function syncEventFromQuote(eventId: number, quoteStatus: QuoteStatus): Promise<void> {
  const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return;
  const next = eventStatusAfterQuote(ev.status, quoteStatus);
  if (next === ev.status) return;
  await db
    .update(events)
    .set({ status: next, updatedAt: now() })
    .where(eq(events.id, eventId));
}
