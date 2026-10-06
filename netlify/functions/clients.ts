import type { Config, Context } from "@netlify/functions";
import { asc } from "drizzle-orm";
import { db } from "../../db";
import { clients } from "../../db/schema";
import { asOptionalString, error, json, now, readJson } from "./_shared/http";
import { denyIfCannot, denyIfUnauthorized } from "./_shared/auth";
import { canEditClients } from "../../shared/roles";

export default async (req: Request, _context: Context) => {
  const denied =
    req.method === "GET" ? await denyIfUnauthorized(req) : await denyIfCannot(req, canEditClients);
  if (denied) return denied;

  if (req.method === "GET") {
    const rows = await db.select().from(clients).orderBy(asc(clients.name));
    return json(rows);
  }

  const body = await readJson(req);
  const name = String(body.name ?? "").trim();
  if (!name) return error("El nombre del cliente es obligatorio");

  const [created] = await db
    .insert(clients)
    .values({
      name,
      phone: asOptionalString(body.phone),
      email: asOptionalString(body.email),
      company: asOptionalString(body.company),
      notes: asOptionalString(body.notes),
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  return json(created, 201);
};

export const config: Config = {
  path: "/api/clients",
  method: ["GET", "POST"],
};
