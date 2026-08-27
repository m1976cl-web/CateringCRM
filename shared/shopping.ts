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

/** Scale recipe ingredients by event portions and merge duplicates (with unit conversion). */
export function buildShoppingLines(recipes: RecipeForShopping[]): ShoppingLine[] {
  return buildShoppingLinesNormalized(recipes);
}

export function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}

/** Convierte a unidad canónica para fusionar (g, ml, unidad). */
export function toCanonical(
  quantity: number,
  unit: IngredientUnit,
): { quantity: number; unit: IngredientUnit } {
  if (unit === "kg") return { quantity: quantity * 1000, unit: "g" };
  if (unit === "L") return { quantity: quantity * 1000, unit: "ml" };
  return { quantity, unit };
}

export function fromCanonical(
  quantity: number,
  unit: IngredientUnit,
): { quantity: number; unit: IngredientUnit } {
  if (unit === "g" && quantity >= 1000) return { quantity: roundQty(quantity / 1000), unit: "kg" };
  if (unit === "ml" && quantity >= 1000) return { quantity: roundQty(quantity / 1000), unit: "L" };
  return { quantity: roundQty(quantity), unit };
}

/** Convierte cantidad entre unidades de la misma familia (g/kg, ml/L). Si no son compatibles, null. */
export function convertQuantity(
  quantity: number,
  from: IngredientUnit,
  to: IngredientUnit,
): number | null {
  if (from === to) return roundQty(quantity);
  const src = toCanonical(quantity, from);
  const destOne = toCanonical(1, to);
  if (src.unit !== destOne.unit) return null;
  return roundQty(src.quantity / destOne.quantity);
}

/** Resta bodega de lo necesario, ambos en sus propias unidades. */
export function quantityAfterStock(
  needQty: number,
  needUnit: IngredientUnit,
  stockQty: number,
  stockUnit: IngredientUnit,
): number {
  const stockInNeed = convertQuantity(stockQty, stockUnit, needUnit);
  if (stockInNeed == null) return roundQty(needQty);
  return roundQty(Math.max(0, needQty - stockInNeed));
}

/** Ajusta bodega (unidad de catálogo) al marcar o desmarcar un ítem comprado. */
export function applyPurchaseToStock(
  currentStock: number,
  catalogUnit: IngredientUnit,
  lineQty: number,
  lineUnit: IngredientUnit,
  wasPurchased: boolean,
  nowPurchased: boolean,
): number {
  if (wasPurchased === nowPurchased) return roundQty(currentStock);
  const delta = convertQuantity(lineQty, lineUnit, catalogUnit);
  if (delta == null) return roundQty(currentStock);
  if (nowPurchased) return roundQty(currentStock + delta);
  return roundQty(Math.max(0, currentStock - delta));
}

export function scaleRecipeLines(
  yieldPortions: number,
  portions: number,
  ingredients: Array<{ name: string; unit: IngredientUnit; quantity: number }>,
): Array<{ name: string; quantity: number; unit: IngredientUnit }> {
  const scale = portions / Math.max(yieldPortions, 1);
  const map = new Map<string, { name: string; quantity: number; unit: IngredientUnit }>();
  for (const ing of ingredients) {
    const canon = toCanonical(ing.quantity * scale, ing.unit);
    const key = `${ing.name}:${canon.unit}`;
    const existing = map.get(key);
    if (existing) existing.quantity += canon.quantity;
    else map.set(key, { name: ing.name, quantity: canon.quantity, unit: canon.unit });
  }
  return [...map.values()].map((line) => {
    const pretty = fromCanonical(line.quantity, line.unit);
    return { name: line.name, quantity: pretty.quantity, unit: pretty.unit };
  });
}

/** Scale + merge with unit normalization (g/kg, ml/L). */
export function buildShoppingLinesNormalized(recipes: RecipeForShopping[]): ShoppingLine[] {
  const map = new Map<string, ShoppingLine>();

  for (const recipe of recipes) {
    const yieldPortions = Math.max(recipe.yieldPortions, 1);
    const scale = recipe.portions / yieldPortions;

    for (const ing of recipe.ingredients) {
      const scaled = ing.quantity * scale;
      const canon = toCanonical(scaled, ing.unit);
      const key = `${ing.ingredientId}:${canon.unit}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += canon.quantity;
      } else {
        map.set(key, {
          ingredientId: ing.ingredientId,
          name: ing.name,
          unit: canon.unit,
          quantity: canon.quantity,
          supplierId: ing.supplierId,
          supplierName: ing.supplierName,
          unitPrice: ing.unitPrice,
        });
      }
    }
  }

  return [...map.values()]
    .map((line) => {
      const pretty = fromCanonical(line.quantity, line.unit);
      // Ajustar precio si pasamos de g→kg o ml→L (precio era por unidad original)
      let unitPrice = line.unitPrice;
      if (unitPrice != null && line.unit !== pretty.unit) {
        if (pretty.unit === "kg" || pretty.unit === "L") unitPrice = unitPrice * 1000;
      }
      return { ...line, quantity: pretty.quantity, unit: pretty.unit, unitPrice };
    })
    .sort((a, b) => {
      const sa = a.supplierName ?? "zzz";
      const sb = b.supplierName ?? "zzz";
      if (sa !== sb) return sa.localeCompare(sb, "es");
      return a.name.localeCompare(b.name, "es");
    });
}

/** Costo estimado de ingredientes escalados al menú del evento. */
export function estimateFoodCost(recipes: RecipeForShopping[]): number {
  const lines = buildShoppingLinesNormalized(recipes);
  return roundQty(
    lines.reduce((sum, line) => {
      if (line.unitPrice == null) return sum;
      return sum + line.quantity * line.unitPrice;
    }, 0),
  );
}
