import { unpackRecipeCategory } from "../shared/recipeMeta";
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
import { notifyOfflineFallback } from "./offlineBanner";
import { isSupabaseConfigured } from "./supabase";
import { cloud } from "./supabaseStore";

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
  stockQty: number;
  supplierName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Recipe = {
  id: number;
  name: string;
  yieldPortions: number;
  category: string | null;
  suitableServices: ServiceType[];
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

function normalizeRecipe(raw: Omit<Recipe, "suitableServices"> & { suitableServices?: ServiceType[] }): Recipe {
  const unpacked = unpackRecipeCategory(raw.category);
  const fromCol = raw.suitableServices?.length ? raw.suitableServices : [];
  return {
    ...raw,
    category: unpacked.category ?? (raw.category?.startsWith("svc:") ? null : raw.category),
    suitableServices: fromCol.length ? fromCol : unpacked.suitableServices,
  };
}

function packRecipeBody(body: RecipeInput): RecipeInput {
  // Persist suitableServices as real field; keep category as free text only.
  return {
    ...body,
    category: body.category?.startsWith("svc:")
      ? unpackRecipeCategory(body.category).category
      : body.category ?? null,
    suitableServices: body.suitableServices ?? [],
  };
}

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
  clientPhone: string | null;
  createdAt: string;
};

export type QuoteDetail = QuoteSummary & {
  eventDate: string;
  attendees: number;
  location: string | null;
  clientEmail: string | null;
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

export type DataMode = "supabase" | "netlify" | "static";

const STATIC_ONLY = import.meta.env.VITE_STATIC_ONLY === "true";
const USE_SUPABASE = isSupabaseConfigured();

/** Backend activo: Supabase (nube) > Netlify API > localStorage. */
export function getDataMode(): DataMode {
  if (USE_SUPABASE) return "supabase";
  if (STATIC_ONLY) return "static";
  return "netlify";
}

export function getDataModeLabel(mode: DataMode = getDataMode()): string {
  switch (mode) {
    case "supabase":
      return "Nube (se comparte)";
    case "netlify":
      return "Servidor";
    case "static":
      return "Solo este dispositivo";
  }
}

/** true si se puede borrar todo (local o Supabase). En API Netlify no hay wipe. */
export function canClearAllData(): boolean {
  return USE_SUPABASE || STATIC_ONLY;
}

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

function route<Args extends unknown[], T>(
  cloudFn: (...args: Args) => Promise<T>,
  remoteFn: (...args: Args) => Promise<T>,
  localFn: (...args: Args) => T | Promise<T>,
): (...args: Args) => Promise<T> {
  return async (...args: Args) => {
    if (USE_SUPABASE) return cloudFn(...args);
    if (STATIC_ONLY) return await localFn(...args);
    try {
      return await remoteFn(...args);
    } catch {
      notifyOfflineFallback();
      return await localFn(...args);
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
  health: route(cloud.health, remote.health, local.health),
  dashboard: route(cloud.dashboard, remote.dashboard, () => local.dashboard()),

  listClients: route(cloud.listClients, remote.listClients, local.listClients),
  getClient: route(cloud.getClient, remote.getClient, (id) => local.getClient(id)),
  createClient: route(cloud.createClient, remote.createClient, (body) => local.createClient(body)),
  updateClient: route(cloud.updateClient, remote.updateClient, (id, body) =>
    local.updateClient(id, body),
  ),
  deleteClient: route(cloud.deleteClient, remote.deleteClient, (id) => local.deleteClient(id)),

  listSuppliers: route(cloud.listSuppliers, remote.listSuppliers, local.listSuppliers),
  createSupplier: route(cloud.createSupplier, remote.createSupplier, (body) =>
    local.createSupplier(body),
  ),
  updateSupplier: route(cloud.updateSupplier, remote.updateSupplier, (id, body) =>
    local.updateSupplier(id, body),
  ),
  deleteSupplier: route(cloud.deleteSupplier, remote.deleteSupplier, (id) =>
    local.deleteSupplier(id),
  ),

  listIngredients: route(cloud.listIngredients, remote.listIngredients, () =>
    local.listIngredients(),
  ),
  createIngredient: route(cloud.createIngredient, remote.createIngredient, (body) =>
    local.createIngredient(body),
  ),
  updateIngredient: route(cloud.updateIngredient, remote.updateIngredient, (id, body) =>
    local.updateIngredient(id, body),
  ),
  deleteIngredient: route(cloud.deleteIngredient, remote.deleteIngredient, (id) =>
    local.deleteIngredient(id),
  ),

  listRecipes: async () => {
    const rows = await route(cloud.listRecipes, remote.listRecipes, local.listRecipes)();
    return rows.map((r) => normalizeRecipe(r));
  },
  getRecipe: async (id: number) =>
    normalizeRecipe(await route(cloud.getRecipe, remote.getRecipe, (x) => local.getRecipe(x))(id)),
  createRecipe: async (body: RecipeInput) =>
    normalizeRecipe(
      await route(cloud.createRecipe, remote.createRecipe, (b) => local.createRecipe(b))(
        packRecipeBody(body),
      ),
    ),
  updateRecipe: async (id: number, body: RecipeInput) =>
    normalizeRecipe(
      await route(cloud.updateRecipe, remote.updateRecipe, (x, b) => local.updateRecipe(x, b))(
        id,
        packRecipeBody(body),
      ),
    ),
  deleteRecipe: route(cloud.deleteRecipe, remote.deleteRecipe, (id) => local.deleteRecipe(id)),

  listEvents: route(cloud.listEvents, remote.listEvents, () => local.listEvents()),
  getEvent: route(cloud.getEvent, remote.getEvent, (id) => local.getEvent(id)),
  createEvent: route(cloud.createEvent, remote.createEvent, (body) => local.createEvent(body)),
  updateEvent: route(cloud.updateEvent, remote.updateEvent, (id, body) =>
    local.updateEvent(id, body),
  ),
  deleteEvent: route(cloud.deleteEvent, remote.deleteEvent, (id) => local.deleteEvent(id)),

  getShoppingList: route(
    (eventId: number, regenerate?: boolean) =>
      cloud.getShoppingList(eventId, regenerate ?? false),
    remote.getShoppingList,
    (eventId: number, regenerate?: boolean) =>
      local.getShoppingList(eventId, regenerate ?? false),
  ),
  updateShoppingList: route(cloud.updateShoppingList, remote.updateShoppingList, (eventId, body) =>
    local.updateShoppingList(eventId, body),
  ),

  listQuotes: route(cloud.listQuotes, remote.listQuotes, () => local.listQuotes()),
  getQuote: route(cloud.getQuote, remote.getQuote, (id) => local.getQuote(id)),
  createQuote: route(cloud.createQuote, remote.createQuote, (body) => local.createQuote(body)),
  updateQuote: route(cloud.updateQuote, remote.updateQuote, (id, body) =>
    local.updateQuote(id, body),
  ),
  deleteQuote: route(cloud.deleteQuote, remote.deleteQuote, (id) => local.deleteQuote(id)),

  isEmpty: async (): Promise<boolean> => {
    if (USE_SUPABASE) return cloud.isEmpty();
    if (STATIC_ONLY) return local.isEmpty();
    try {
      const d = await remote.dashboard();
      return (
        d.counts.clients === 0 &&
        d.counts.events === 0 &&
        d.counts.recipes === 0
      );
    } catch {
      return local.isEmpty();
    }
  },

  clearAll: async (): Promise<{ ok: boolean }> => {
    if (USE_SUPABASE) return cloud.clearAll();
    if (STATIC_ONLY) return local.clearAll();
    throw new Error(
      "En modo servidor no se pueden borrar todos los datos desde aquí. Usa la base de datos o cambia a modo local/nube.",
    );
  },

  exportLocalBackup: (): string => local.exportJson(),
  importLocalBackup: (json: string): { ok: boolean } => local.importJson(json),
};

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function isSameCalendarDay(a: string | Date, b: Date = new Date()): boolean {
  const d = typeof a === "string" ? new Date(a) : a;
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === b.getFullYear() &&
    d.getMonth() === b.getMonth() &&
    d.getDate() === b.getDate()
  );
}

export function toDateInput(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function toDatetimeLocal(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
