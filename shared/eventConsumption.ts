import { convertQuantity, roundQty } from "./shopping";
import type { IngredientUnit } from "./types";

export const STOCK_SHORT_PREFIX = "No alcanza el stock para marcar el evento como realizado.";

export type ConsumptionLine = {
  ingredientId: number;
  name: string;
  unit: IngredientUnit;
  need: number;
  stock: number;
  deduct: number;
  short: number;
};

export function planMenuConsumption(
  needs: Array<{ ingredientId: number; name: string; unit: IngredientUnit; quantity: number }>,
  stockById: Map<number, { stockQty: number; unit: IngredientUnit; name: string }>,
): ConsumptionLine[] {
  const merged = new Map<number, { name: string; unit: IngredientUnit; quantity: number }>();
  for (const need of needs) {
    if (!(need.quantity > 0)) continue;
    const stock = stockById.get(need.ingredientId);
    const unit = stock?.unit ?? need.unit;
    const qty =
      stock && need.unit !== unit ? convertQuantity(need.quantity, need.unit, unit) : roundQty(need.quantity);
    if (qty == null || !(qty > 0)) continue;
    const prev = merged.get(need.ingredientId);
    if (prev) prev.quantity = roundQty(prev.quantity + qty);
    else merged.set(need.ingredientId, { name: stock?.name ?? need.name, unit, quantity: qty });
  }
  return [...merged.entries()].map(([ingredientId, row]) => {
    const stockQty = roundQty(Math.max(0, stockById.get(ingredientId)?.stockQty ?? 0));
    const deduct = roundQty(Math.min(stockQty, row.quantity));
    const short = roundQty(Math.max(0, row.quantity - stockQty));
    return {
      ingredientId,
      name: row.name,
      unit: row.unit,
      need: row.quantity,
      stock: stockQty,
      deduct,
      short,
    };
  });
}

export function stockShortMessage(lines: ConsumptionLine[]): string {
  const detail = lines
    .filter((line) => line.short > 0)
    .map((line) => `${line.name} (faltan ${line.short} ${line.unit})`)
    .join(", ");
  return `${STOCK_SHORT_PREFIX} ${detail}.`;
}

export function shouldConsumeMenu(
  previousStatus: string,
  nextStatus: string,
  alreadyConsumed: boolean,
): boolean {
  return nextStatus === "realizado" && previousStatus !== "realizado" && !alreadyConsumed;
}

export function eventReadyText(input: {
  title: string;
  when: string;
  location?: string | null;
  balanceLabel?: string | null;
}): string {
  const lines = [`Hola, el evento «${input.title}» está listo.`, `Fecha: ${input.when}`];
  if (input.location?.trim()) lines.push(`Lugar: ${input.location.trim()}`);
  if (input.balanceLabel?.trim()) lines.push(input.balanceLabel.trim());
  lines.push("Cualquier cambio, avísanos.");
  return lines.join("\n");
}
