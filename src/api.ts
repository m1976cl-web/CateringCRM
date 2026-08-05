import type {
  ClientInput,
  EventInput,
  EventStatus,
  IngredientInput,
  IngredientUnit,
  QuoteInput,
  QuoteItem,
  QuoteStatus,
  RecipeInput,
  ServiceType,
  ShoppingListStatus,
  SupplierInput,
} from "../shared/types";
import { local } from "./localStore";

export type Client = ClientInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export type Supplier = SupplierInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export type Ingredient = {
  id: number;
  name: string;
  unit: IngredientUnit;
  supplierId: number | null;
  unitPrice: number | null;
  supplierName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Recipe = {
  id: number;
  name: string;
  yieldPortions: number;
  category: string | null;
  instructions: string | null;
  estimatedCost: number | null;
  ingredients: Array<{
    id: number;
    ingredientId: number;
    quantity: number;
    name: string;
    unit: IngredientUnit;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type EventSummary = {
  id: number;
  clientId: number;
  title: string;
  eventDate: string;
  location: string | null;
  attendees: number;
  status: EventStatus;
  estimatedCost: number | null;
  clientName: string;
  services: ServiceType[];
};

export type EventDetail = EventSummary & {
  dietaryRestrictions: string | null;
  notes: string | null;
  recipes: Array<{
    id: number;
    recipeId: number;
    serviceType: ServiceType;
    portions: number;
    recipeName: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type QuoteSummary = {
  id: number;
  eventId: number;
  quoteNumber: string | null;
  quoteDate: string;
  items: QuoteItem[];
  total: number;
  notes: string | null;
  status: QuoteStatus;
  eventTitle: string;
  clientName: string;
  createdAt: string;
};

export type QuoteDetail = QuoteSummary & {
  eventDate: string;
  attendees: number;
  location: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientCompany: string | null;
  updatedAt: string;
};

export type ShoppingList = {
  id: number;
  eventId: number;
  status: ShoppingListStatus;
  generatedAt: string;
  items: Array<{
    id: number;
    ingredientId: number;
    quantity: number;
    unit: IngredientUnit;
    purchased: boolean;
    name: string;
    supplierId: number | null;
    supplierName: string | null;
    unitPrice: number | null;
  }>;
};

export type Dashboard = {
  counts: {
    clients: number;
    recipes: number;
    events: number;
    quotes: number;
    pendingShoppingLists: number;
  };
  upcoming: Array<{
    id: number;
    title: string;
    eventDate: string;
    attendees: number;
    status: EventStatus;
    clientId: number;
    clientName: string;
  }>;
  alerts: {
    confirmedSoon: number;
    needsAttention: number;
  };
};

const STATIC_ONLY = import.meta.env.VITE_STATIC_ONLY === "true";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : `Error ${res.status}`,
    );
  }
  return data as T;
}

function withFallback<Args extends unknown[], T>(
  remote: (...args: Args) => Promise<T>,
  localFn: (...args: Args) => T,
): (...args: Args) => Promise<T> {
  return async (...args: Args) => {
    if (STATIC_ONLY) return localFn(...args);
    try {
      return await remote(...args);
    } catch {
      return localFn(...args);
    }
  };
}

const remote = {
  health: () => request<{ ok: boolean; db: boolean }>("/api/health"),
  dashboard: () => request<Dashboard>("/api/dashboard"),

  listClients: () => request<Client[]>("/api/clients"),
  getClient: (id: number) => request<Client>(`/api/clients/${id}`),
  createClient: (body: ClientInput) =>
    request<Client>("/api/clients", { method: "POST", body: JSON.stringify(body) }),
  updateClient: (id: number, body: ClientInput) =>
    request<Client>(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteClient: (id: number) =>
    request<{ ok: boolean }>(`/api/clients/${id}`, { method: "DELETE" }),

  listSuppliers: () => request<Supplier[]>("/api/suppliers"),
  createSupplier: (body: SupplierInput) =>
    request<Supplier>("/api/suppliers", { method: "POST", body: JSON.stringify(body) }),
  updateSupplier: (id: number, body: SupplierInput) =>
    request<Supplier>(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSupplier: (id: number) =>
    request<{ ok: boolean }>(`/api/suppliers/${id}`, { method: "DELETE" }),

  listIngredients: () => request<Ingredient[]>("/api/ingredients"),
  createIngredient: (body: IngredientInput) =>
    request<Ingredient>("/api/ingredients", { method: "POST", body: JSON.stringify(body) }),
  updateIngredient: (id: number, body: IngredientInput) =>
    request<Ingredient>(`/api/ingredients/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteIngredient: (id: number) =>
    request<{ ok: boolean }>(`/api/ingredients/${id}`, { method: "DELETE" }),

  listRecipes: () => request<Recipe[]>("/api/recipes"),
  getRecipe: (id: number) => request<Recipe>(`/api/recipes/${id}`),
  createRecipe: (body: RecipeInput) =>
    request<Recipe>("/api/recipes", { method: "POST", body: JSON.stringify(body) }),
  updateRecipe: (id: number, body: RecipeInput) =>
    request<Recipe>(`/api/recipes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteRecipe: (id: number) =>
    request<{ ok: boolean }>(`/api/recipes/${id}`, { method: "DELETE" }),

  listEvents: () => request<EventSummary[]>("/api/events"),
  getEvent: (id: number) => request<EventDetail>(`/api/events/${id}`),
  createEvent: (body: EventInput) =>
    request<EventDetail>("/api/events", { method: "POST", body: JSON.stringify(body) }),
  updateEvent: (id: number, body: EventInput) =>
    request<EventDetail>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteEvent: (id: number) =>
    request<{ ok: boolean }>(`/api/events/${id}`, { method: "DELETE" }),

  getShoppingList: (eventId: number, regenerate?: boolean) =>
    request<ShoppingList>(
      `/api/events/${eventId}/shopping-list${regenerate ? "?regenerate=1" : ""}`,
    ),
  updateShoppingList: (
    eventId: number,
    body: { items?: Array<{ id: number; purchased: boolean }>; status?: ShoppingListStatus },
  ) =>
    request<ShoppingList>(`/api/events/${eventId}/shopping-list`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  listQuotes: () => request<QuoteSummary[]>("/api/quotes"),
  getQuote: (id: number) => request<QuoteDetail>(`/api/quotes/${id}`),
  createQuote: (body: QuoteInput) =>
    request<QuoteDetail>("/api/quotes", { method: "POST", body: JSON.stringify(body) }),
  updateQuote: (id: number, body: QuoteInput) =>
    request<QuoteDetail>(`/api/quotes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteQuote: (id: number) =>
    request<{ ok: boolean }>(`/api/quotes/${id}`, { method: "DELETE" }),
};

export const api = {
  health: withFallback(remote.health, local.health),
  dashboard: withFallback(remote.dashboard, () => local.dashboard()),

  listClients: withFallback(remote.listClients, local.listClients),
  getClient: withFallback(remote.getClient, (id) => local.getClient(id)),
  createClient: withFallback(remote.createClient, (body) => local.createClient(body)),
  updateClient: withFallback(remote.updateClient, (id, body) => local.updateClient(id, body)),
  deleteClient: withFallback(remote.deleteClient, (id) => local.deleteClient(id)),

  listSuppliers: withFallback(remote.listSuppliers, local.listSuppliers),
  createSupplier: withFallback(remote.createSupplier, (body) => local.createSupplier(body)),
  updateSupplier: withFallback(remote.updateSupplier, (id, body) =>
    local.updateSupplier(id, body),
  ),
  deleteSupplier: withFallback(remote.deleteSupplier, (id) => local.deleteSupplier(id)),

  listIngredients: withFallback(remote.listIngredients, () => local.listIngredients()),
  createIngredient: withFallback(remote.createIngredient, (body) =>
    local.createIngredient(body),
  ),
  updateIngredient: withFallback(remote.updateIngredient, (id, body) =>
    local.updateIngredient(id, body),
  ),
  deleteIngredient: withFallback(remote.deleteIngredient, (id) => local.deleteIngredient(id)),

  listRecipes: withFallback(remote.listRecipes, local.listRecipes),
  getRecipe: withFallback(remote.getRecipe, (id) => local.getRecipe(id)),
  createRecipe: withFallback(remote.createRecipe, (body) => local.createRecipe(body)),
  updateRecipe: withFallback(remote.updateRecipe, (id, body) => local.updateRecipe(id, body)),
  deleteRecipe: withFallback(remote.deleteRecipe, (id) => local.deleteRecipe(id)),

  listEvents: withFallback(remote.listEvents, () => local.listEvents()),
  getEvent: withFallback(remote.getEvent, (id) => local.getEvent(id)),
  createEvent: withFallback(remote.createEvent, (body) => local.createEvent(body)),
  updateEvent: withFallback(remote.updateEvent, (id, body) => local.updateEvent(id, body)),
  deleteEvent: withFallback(remote.deleteEvent, (id) => local.deleteEvent(id)),

  getShoppingList: async (eventId: number, regenerate?: boolean) => {
    if (STATIC_ONLY) return local.getShoppingList(eventId, regenerate ?? false);
    try {
      return await remote.getShoppingList(eventId, regenerate);
    } catch {
      return local.getShoppingList(eventId, regenerate ?? false);
    }
  },
  updateShoppingList: withFallback(remote.updateShoppingList, (eventId, body) =>
    local.updateShoppingList(eventId, body),
  ),

  listQuotes: withFallback(remote.listQuotes, () => local.listQuotes()),
  getQuote: withFallback(remote.getQuote, (id) => local.getQuote(id)),
  createQuote: withFallback(remote.createQuote, (body) => local.createQuote(body)),
  updateQuote: withFallback(remote.updateQuote, (id, body) => local.updateQuote(id, body)),
  deleteQuote: withFallback(remote.deleteQuote, (id) => local.deleteQuote(id)),
};

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function toDatetimeLocal(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
