import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { ingredients, recipeIngredients, recipes } from "../../db/schema";
import { asNumber, asOptionalString, error, json, now, parseId, readJson } from "./_shared/http";

async function recipeWithIngredients(recipeId: number) {
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1);
  if (!recipe) return null;

  const ings = await db
    .select({
      id: recipeIngredients.id,
      ingredientId: recipeIngredients.ingredientId,
      quantity: recipeIngredients.quantity,
      name: ingredients.name,
      unit: ingredients.unit,
    })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(eq(recipeIngredients.recipeId, recipeId));

  return { ...recipe, ingredients: ings };
}

export default async (req: Request, context: Context) => {
  const id = parseId(context.params?.id);
  if (!id) return error("ID inválido", 400);

  if (req.method === "GET") {
    const row = await recipeWithIngredients(id);
    if (!row) return error("Receta no encontrada", 404);
    return json(row);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const name = String(body.name ?? "").trim();
    if (!name) return error("El nombre de la receta es obligatorio");
    const yieldPortions = Math.max(1, Math.floor(asNumber(body.yieldPortions, 1)));
    const ingredientList = Array.isArray(body.ingredients) ? body.ingredients : [];

    const [updated] = await db
      .update(recipes)
      .set({
        name,
        yieldPortions,
        category: asOptionalString(body.category),
        instructions: asOptionalString(body.instructions),
        estimatedCost:
          body.estimatedCost === null ||
          body.estimatedCost === undefined ||
          body.estimatedCost === ""
            ? null
            : asNumber(body.estimatedCost),
        updatedAt: now(),
      })
      .where(eq(recipes.id, id))
      .returning();

    if (!updated) return error("Receta no encontrada", 404);

    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    for (const item of ingredientList) {
      const ingredientId = asNumber(item.ingredientId, 0);
      const quantity = asNumber(item.quantity, 0);
      if (ingredientId > 0 && quantity > 0) {
        await db.insert(recipeIngredients).values({
          recipeId: id,
          ingredientId,
          quantity,
        });
      }
    }

    return json(await recipeWithIngredients(id));
  }

  if (req.method === "DELETE") {
    try {
      const [deleted] = await db.delete(recipes).where(eq(recipes.id, id)).returning();
      if (!deleted) return error("Receta no encontrada", 404);
      return json({ ok: true });
    } catch {
      return error("No se puede eliminar: la receta está en uso en eventos", 409);
    }
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/recipes/:id",
  method: ["GET", "PUT", "PATCH", "DELETE"],
};
