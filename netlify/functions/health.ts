import type { Config, Context } from "@netlify/functions";
import { db } from "../../db";
import { clients } from "../../db/schema";

export default async (_req: Request, _context: Context) => {
  let dbOk = false;
  try {
    await db.select().from(clients).limit(1);
    dbOk = true;
  } catch (err) {
    console.error("DB health check failed:", err);
  }

  return Response.json({ ok: dbOk, db: dbOk });
};

export const config: Config = {
  path: "/api/health",
  method: ["GET"],
};
