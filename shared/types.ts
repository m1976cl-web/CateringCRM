export const EVENT_STATUSES = [
  "borrador",
  "cotizado",
  "confirmado",
  "realizado",
  "cancelado",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  borrador: "Borrador",
  cotizado: "Cotizado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export const SERVICE_TYPES = [
  "desayuno",
  "almuerzo",
  "cena",
  "coffee_break",
  "otro",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
  coffee_break: "Coffee break",
  otro: "Otro",
};

export const INGREDIENT_UNITS = ["g", "kg", "ml", "L", "unidad"] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const QUOTE_STATUSES = ["borrador", "enviada", "aceptada", "rechazada"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export const SHOPPING_LIST_STATUSES = ["pendiente", "comprado"] as const;
export type ShoppingListStatus = (typeof SHOPPING_LIST_STATUSES)[number];

export type QuoteItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type ClientInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
};

export type SupplierInput = {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export type IngredientInput = {
  name: string;
  unit: IngredientUnit;
  supplierId?: number | null;
  unitPrice?: number | null;
  stockQty?: number | null;
};

export type RecipeIngredientInput = {
  ingredientId: number;
  quantity: number;
};

export type RecipeInput = {
  name: string;
  yieldPortions: number;
  category?: string | null;
  /** Servicios del día para los que encaja (desayuno, almuerzo…). */
  suitableServices?: ServiceType[];
  instructions?: string | null;
  estimatedCost?: number | null;
  ingredients: RecipeIngredientInput[];
};

export type EventRecipeInput = {
  recipeId: number;
  serviceType: ServiceType;
  portions: number;
};

export type EventInput = {
  clientId: number;
  title: string;
  eventDate: string;
  location?: string | null;
  attendees: number;
  status: EventStatus;
  dietaryRestrictions?: string | null;
  notes?: string | null;
  estimatedCost?: number | null;
  services: ServiceType[];
  recipes: EventRecipeInput[];
};

export type QuoteInput = {
  eventId: number;
  quoteNumber?: string | null;
  quoteDate?: string | null;
  items: QuoteItem[];
  notes?: string | null;
  status: QuoteStatus;
};

export type ShoppingLine = {
  ingredientId: number;
  name: string;
  unit: IngredientUnit;
  quantity: number;
  supplierId: number | null;
  supplierName: string | null;
  unitPrice: number | null;
};

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === "string" && (EVENT_STATUSES as readonly string[]).includes(value);
}

export function isServiceType(value: unknown): value is ServiceType {
  return typeof value === "string" && (SERVICE_TYPES as readonly string[]).includes(value);
}

export function isIngredientUnit(value: unknown): value is IngredientUnit {
  return typeof value === "string" && (INGREDIENT_UNITS as readonly string[]).includes(value);
}

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === "string" && (QUOTE_STATUSES as readonly string[]).includes(value);
}

export function quoteTotal(items: QuoteItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}
