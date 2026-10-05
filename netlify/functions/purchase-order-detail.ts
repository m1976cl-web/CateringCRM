import type { Config, Context } from "@netlify/functions";
import { canEditPrices } from "../../shared/roles";
import { denyIfCannot, denyIfUnauthorized } from "./_shared/auth";
import { error, json, parseId, readJson } from "./_shared/http";
import { cancelOrder, loadOrder, receiveOrder } from "./_shared/purchases";

export default async (req: Request, context: Context) => {
  const denied =
    req.method === "GET" ? await denyIfUnauthorized(req) : await denyIfCannot(req, canEditPrices);
  if (denied) return denied;

  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const order = await loadOrder(id);
    if (!order) return error("Orden no encontrada", 404);
    return json(order);
  }

  if (req.method === "POST") {
    const action = new URL(req.url).searchParams.get("action");
    try {
      if (action === "cancel") return json(await cancelOrder(id));
      if (action === "receive") return json(await receiveOrder(id, await readJson(req)));
      return error("Acción no válida");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar la orden";
      return error(message, message === "Orden no encontrada" ? 404 : 400);
    }
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/purchase-orders/:id",
  method: ["GET", "POST"],
};
