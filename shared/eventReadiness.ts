import { defaultPackingItems, parsePackingItems } from "./ops";

export type ShoppingReadiness = "none" | "pending" | "partial" | "done";

export type EventReadiness = {
  recipeCount: number;
  packingDone: number;
  packingTotal: number;
  shopping: ShoppingReadiness;
};

export type ReadinessChip = {
  key: "menu" | "compras" | "packing" | "saldo";
  label: string;
};

export function shoppingReadiness(
  purchased: number,
  total: number,
  listExists: boolean,
): ShoppingReadiness {
  if (!listExists) return "none";
  if (total <= 0 || purchased >= total) return "done";
  if (purchased <= 0) return "pending";
  return "partial";
}

export function packingProgress(value: unknown): { done: number; total: number } {
  const parsed = parsePackingItems(value);
  const items = parsed.length ? parsed : defaultPackingItems();
  return {
    done: items.filter((item) => item.packed).length,
    total: items.length,
  };
}

export function buildReadiness(input: {
  recipeCount: number;
  packing: unknown;
  purchased: number;
  shoppingItemCount: number;
  listExists: boolean;
}): EventReadiness {
  const packing = packingProgress(input.packing);
  return {
    recipeCount: input.recipeCount,
    packingDone: packing.done,
    packingTotal: packing.total,
    shopping: shoppingReadiness(input.purchased, input.shoppingItemCount, input.listExists),
  };
}

export function shoppingStatusLabel(shopping: ShoppingReadiness, recipeCount: number): string {
  if (recipeCount <= 0) return "Primero el menú";
  if (shopping === "none") return "Falta generar la lista";
  if (shopping === "pending") return "Lista sin marcar";
  if (shopping === "partial") return "Compra a medias";
  return "Lista comprada";
}

export function readinessChips(input: {
  status?: string;
  recipeCount: number;
  shopping: ShoppingReadiness;
  packingDone: number;
  packingTotal: number;
  balance: number | null;
}): ReadinessChip[] {
  if (input.status === "cancelado") return [];
  const chips: ReadinessChip[] = [];
  if (input.recipeCount <= 0) chips.push({ key: "menu", label: "Sin menú" });
  else if (input.shopping === "none") chips.push({ key: "compras", label: "Sin lista" });
  else if (input.shopping === "pending") chips.push({ key: "compras", label: "Compras" });
  else if (input.shopping === "partial") chips.push({ key: "compras", label: "Compras a medias" });
  if (input.packingTotal > 0 && input.packingDone < input.packingTotal) {
    chips.push({ key: "packing", label: "Packing" });
  }
  if (input.balance != null && input.balance > 0) chips.push({ key: "saldo", label: "Saldo" });
  return chips;
}
