import type { Config } from "@netlify/functions";
import { canEditPrices } from "../../shared/roles";
import { denyIfCannot, denyIfUnauthorized } from "./_shared/auth";
import { asNumber, error, json, parseId, readJson } from "./_shared/http";
import { createOrdersFromShopping, loadOrders } from "./_shared/purchases";

export default async (req: Request) => {
  if (req.method === "GET") {
    const denied = await denyIfUnauthorized(req);
    if (denied) return denied;
    const eventId = parseId(new URL(req.url).searchParams.get("eventId") ?? undefined);
    return json(await loadOrders(eventId));
  }

  if (req.method === "POST") {
    const denied = await denyIfCannot(req, canEditPrices);
    if (denied) return denied;
    const body = await readJson(req);
    const eventId = asNumber(body.eventId, 0);
    if (!Number.isInteger(eventId) || eventId <= 0) return error("Evento no válido");
    try {
      const created = await createOrdersFromShopping(eventId);
      return json(created, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la orden";
      const status = message.includes("Genérala primero") ? 404 : 400;
      return error(message, status);
    }
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/purchase-orders",
  method: ["GET", "POST"],
};
