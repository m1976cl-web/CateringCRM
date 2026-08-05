import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import {
  eventRecipes,
  ingredients,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingLists,
  suppliers,
} from "../../db/schema";
import { buildShoppingLines, roundQty } from "../../shared/shopping";
import { error, json, now, parseId, readJson } from "./_shared/http";

async function loadShoppingList(eventId: number) {
  const [list] = await db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.eventId, eventId))
    .limit(1);

  if (!list) return null;

  const items = await db
    .select({
      id: shoppingListItems.id,
      ingredientId: shoppingListItems.ingredientId,
      quantity: shoppingListItems.quantity,
      unit: shoppingListItems.unit,
      purchased: shoppingListItems.purchased,
      name: ingredients.name,
      supplierId: ingredients.supplierId,
      supplierName: suppliers.name,
      unitPrice: ingredients.unitPrice,
    })
    .from(shoppingListItems)
    .innerJoin(ingredients, eq(shoppingListItems.ingredientId, ingredients.id))
    .leftJoin(suppliers, eq(ingredients.supplierId, suppliers.id))
    .where(eq(shoppingListItems.shoppingListId, list.id));

  return { ...list, items };
}

async function regenerate(eventId: number) {
  const menu = await db
    .select({
      recipeId: eventRecipes.recipeId,
      portions: eventRecipes.portions,
      yieldPortions: recipes.yieldPortions,
    })
    .from(eventRecipes)
    .innerJoin(recipes, eq(eventRecipes.recipeId, recipes.id))
    .where(eq(eventRecipes.eventId, eventId));

  const recipesForShopping = await Promise.all(
    menu.map(async (m) => {
      const ings = await db
        .select({
          ingredientId: recipeIngredients.ingredientId,
          quantity: recipeIngredients.quantity,
          name: ingredients.name,
          unit: ingredients.unit,
          supplierId: ingredients.supplierId,
          supplierName: suppliers.name,
          unitPrice: ingredients.unitPrice,
        })
        .from(recipeIngredients)
        .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
        .leftJoin(suppliers, eq(ingredients.supplierId, suppliers.id))
        .where(eq(recipeIngredients.recipeId, m.recipeId));

      return {
        yieldPortions: m.yieldPortions,
        portions: m.portions,
        ingredients: ings,
      };
    }),
  );

  const lines = buildShoppingLines(recipesForShopping).map((l) => ({
    ...l,
    quantity: roundQty(l.quantity),
  }));

  const existing = await db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.eventId, eventId))
    .limit(1);

  let listId: number;
  if (existing[0]) {
    listId = existing[0].id;
    await db.delete(shoppingListItems).where(eq(shoppingListItems.shoppingListId, listId));
    await db
      .update(shoppingLists)
      .set({ generatedAt: now(), status: "pendiente" })
      .where(eq(shoppingLists.id, listId));
  } else {
    const [created] = await db
      .insert(shoppingLists)
      .values({ eventId, status: "pendiente", generatedAt: now() })
      .returning();
    listId = created.id;
  }

  for (const line of lines) {
    await db.insert(shoppingListItems).values({
      shoppingListId: listId,
      ingredientId: line.ingredientId,
      quantity: line.quantity,
      unit: line.unit,
      purchased: false,
    });
  }

  return loadShoppingList(eventId);
}

export default async (req: Request, context: Context) => {
  const eventId = parseId(context.params?.id);
  if (!eventId) return error("ID de evento inválido", 400);

  if (req.method === "GET") {
    const regenerateFlag = new URL(req.url).searchParams.get("regenerate") === "1";
    const existing = await loadShoppingList(eventId);
    if (!existing || regenerateFlag) {
      const generated = await regenerate(eventId);
      return json(generated);
    }
    return json(existing);
  }

  if (req.method === "PATCH") {
    const body = await readJson(req);
    const list = await loadShoppingList(eventId);
    if (!list) return error("No hay lista de compras. Genérala primero.", 404);

    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        const itemId = Number(item.id);
        if (!Number.isInteger(itemId)) continue;
        await db
          .update(shoppingListItems)
          .set({ purchased: Boolean(item.purchased) })
          .where(eq(shoppingListItems.id, itemId));
      }
    }

    if (body.status === "pendiente" || body.status === "comprado") {
      await db
        .update(shoppingLists)
        .set({ status: body.status })
        .where(eq(shoppingLists.id, list.id));
    }

    return json(await loadShoppingList(eventId));
  }

  return error("Método no permitido", 405);
};

export const config: Config = {
  path: "/api/events/:id/shopping-list",
  method: ["GET", "PATCH"],
};
