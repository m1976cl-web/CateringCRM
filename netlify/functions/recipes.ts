import type { Config, Context } from "@netlify/functions";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { ingredients, recipeIngredients, recipes } from "../../db/schema";
import { asNumber, asOptionalString, error, json, now, readJson } from "./_shared/http";
import { denyIfUnauthorized } from "./_shared/auth";

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

export default async (req: Request, _context: Context) => {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const all = await db.select().from(recipes).orderBy(asc(recipes.name));
    const detailed = await Promise.all(all.map((r) => recipeWithIngredients(r.id)));
    return json(detailed.filter(Boolean));
  }

  const body = await readJson(req);
  const name = String(body.name ?? "").trim();
  if (!name) return error("El nombre de la receta es obligatorio");
  const yieldPortions = Math.max(1, Math.floor(asNumber(body.yieldPortions, 1)));
  const ingredientList = Array.isArray(body.ingredients) ? body.ingredients : [];

  const [created] = await db
    .insert(recipes)
    .values({
      name,
      yieldPortions,
      category: asOptionalString(body.category),
      suitableServices: Array.isArray(body.suitableServices)
        ? body.suitableServices
        : [],
      instructions: asOptionalString(body.instructions),
      estimatedCost:
        body.estimatedCost === null || body.estimatedCost === undefined || body.estimatedCost === ""
          ? null
          : asNumber(body.estimatedCost),
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  for (const item of ingredientList) {
    const ingredientId = asNumber(item.ingredientId, 0);
    const quantity = asNumber(item.quantity, 0);
    if (ingredientId > 0 && quantity > 0) {
      await db.insert(recipeIngredients).values({
        recipeId: created.id,
        ingredientId,
        quantity,
      });
    }
  }

  return json(await recipeWithIngredients(created.id), 201);
};

export const config: Config = {
  path: "/api/recipes",
  method: ["GET", "POST"],
};
