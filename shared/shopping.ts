import type { IngredientUnit, ShoppingLine } from "./types";

export type RecipeForShopping = {
  yieldPortions: number;
  portions: number;
  ingredients: Array<{
    ingredientId: number;
    name: string;
    unit: IngredientUnit;
    quantity: number;
    supplierId: number | null;
    supplierName: string | null;
    unitPrice: number | null;
  }>;
};

/** Scale recipe ingredients by event portions and merge duplicates. */
export function buildShoppingLines(recipes: RecipeForShopping[]): ShoppingLine[] {
  const map = new Map<number, ShoppingLine>();

  for (const recipe of recipes) {
    const yieldPortions = Math.max(recipe.yieldPortions, 1);
    const scale = recipe.portions / yieldPortions;

    for (const ing of recipe.ingredients) {
      const qty = ing.quantity * scale;
      const existing = map.get(ing.ingredientId);
      if (existing) {
        existing.quantity += qty;
      } else {
        map.set(ing.ingredientId, {
          ingredientId: ing.ingredientId,
          name: ing.name,
          unit: ing.unit,
          quantity: qty,
          supplierId: ing.supplierId,
          supplierName: ing.supplierName,
          unitPrice: ing.unitPrice,
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const sa = a.supplierName ?? "zzz";
    const sb = b.supplierName ?? "zzz";
    if (sa !== sb) return sa.localeCompare(sb, "es");
    return a.name.localeCompare(b.name, "es");
  });
}

export function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}
