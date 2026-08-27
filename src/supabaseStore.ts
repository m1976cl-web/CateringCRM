import { buildShoppingLines, roundQty } from "../shared/shopping";
import {
  quoteTotal,
  type ClientInput,
  type EventInput,
  type EventStatus,
  type IngredientInput,
  type IngredientUnit,
  type QuoteInput,
  type QuoteItem,
  type QuoteStatus,
  type RecipeInput,
  type ServiceType,
  type ShoppingListStatus,
  type SupplierInput,
} from "../shared/types";
import { eventStatusAfterQuote, normalizeDeposit } from "../shared/quoteLifecycle";
import type {
  Client,
  Dashboard,
  EventDetail,
  EventSummary,
  Ingredient,
  QuoteDetail,
  QuoteSummary,
  Recipe,
  ShoppingList,
  Supplier,
} from "./api";
import { getSupabase } from "./supabase";

type ClientRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SupplierRow = {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type IngredientRow = {
  id: number;
  name: string;
  unit: IngredientUnit;
  supplier_id: number | null;
  unit_price: number | null;
  stock_qty?: number | null;
  created_at: string;
  updated_at: string;
};

type RecipeRow = {
  id: number;
  name: string;
  yield_portions: number;
  category: string | null;
  suitable_services?: ServiceType[] | null;
  instructions: string | null;
  estimated_cost: number | null;
  created_at: string;
  updated_at: string;
};

type RecipeIngredientRow = {
  id: number;
  recipe_id: number;
  ingredient_id: number;
  quantity: number;
};

type EventRow = {
  id: number;
  client_id: number;
  title: string;
  event_date: string;
  location: string | null;
  attendees: number;
  status: EventStatus;
  dietary_restrictions: string | null;
  notes: string | null;
  estimated_cost: number | null;
  created_at: string;
  updated_at: string;
};

type QuoteRow = {
  id: number;
  event_id: number;
  quote_number: string | null;
  quote_date: string;
  items: QuoteItem[];
  total: number;
  notes: string | null;
  status: QuoteStatus;
  deposit_amount?: number | null;
  created_at: string;
  updated_at: string;
};

type ShoppingListRow = {
  id: number;
  event_id: number;
  status: ShoppingListStatus;
  generated_at: string;
};

type ShoppingItemRow = {
  id: number;
  shopping_list_id: number;
  ingredient_id: number;
  quantity: number;
  unit: IngredientUnit;
  purchased: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

function assertOk<T>(data: T | null, error: { message: string } | null, fallback: string): T {
  if (error) throw new Error(error.message || fallback);
  if (data === null || data === undefined) fail(fallback);
  return data;
}

function iso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

async function syncEventFromQuote(eventId: number, quoteStatus: QuoteStatus) {
  const db = getSupabase();
  const { data, error } = await db
    .from("events")
    .select("id, status")
    .eq("id", eventId)
    .maybeSingle();
  const ev = data as { id: number; status: EventStatus } | null;
  if (error || !ev) return;
  const next = eventStatusAfterQuote(ev.status, quoteStatus);
  if (next === ev.status) return;
  const { error: upd } = await db
    .from("events")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", ev.id);
  if (upd) throw new Error(upd.message);
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapIngredient(row: IngredientRow, supplierName?: string | null): Ingredient {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    supplierId: row.supplier_id,
    unitPrice: row.unit_price,
    stockQty: row.stock_qty ?? 0,
    supplierName: supplierName ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function loadRecipe(id: number): Promise<Recipe> {
  const db = getSupabase();
  const { data: row, error } = await db.from("recipes").select("*").eq("id", id).maybeSingle();
  const recipe = assertOk(row as RecipeRow | null, error, "Receta no encontrada");

  const { data: links, error: linkErr } = await db
    .from("recipe_ingredients")
    .select("*")
    .eq("recipe_id", id);
  if (linkErr) throw new Error(linkErr.message);

  const ingredientIds = (links as RecipeIngredientRow[]).map((l) => l.ingredient_id);
  const { data: ings } = ingredientIds.length
    ? await db.from("ingredients").select("*").in("id", ingredientIds)
    : { data: [] as IngredientRow[] };
  const byId = new Map((ings as IngredientRow[] | null)?.map((i) => [i.id, i]) ?? []);

  return {
    id: recipe.id,
    name: recipe.name,
    yieldPortions: recipe.yield_portions,
    category: recipe.category,
    suitableServices: recipe.suitable_services ?? [],
    instructions: recipe.instructions,
    estimatedCost: recipe.estimated_cost,
    ingredients: (links as RecipeIngredientRow[]).map((l) => {
      const cat = byId.get(l.ingredient_id);
      return {
        id: l.id,
        ingredientId: l.ingredient_id,
        quantity: l.quantity,
        name: cat?.name ?? "—",
        unit: (cat?.unit ?? "unidad") as IngredientUnit,
      };
    }),
    createdAt: iso(recipe.created_at),
    updatedAt: iso(recipe.updated_at),
  };
}

async function loadEventDetail(id: number): Promise<EventDetail> {
  const db = getSupabase();
  const { data: row, error } = await db.from("events").select("*").eq("id", id).maybeSingle();
  const ev = assertOk(row as EventRow | null, error, "Evento no encontrado");

  const [{ data: client }, { data: services }, { data: recipes }] = await Promise.all([
    db.from("clients").select("name").eq("id", ev.client_id).maybeSingle(),
    db.from("event_services").select("service_type").eq("event_id", id),
    db.from("event_recipes").select("*").eq("event_id", id),
  ]);

  const recipeIds = ((recipes as Array<{ recipe_id: number }> | null) ?? []).map((r) => r.recipe_id);
  const { data: recipeRows } = recipeIds.length
    ? await db.from("recipes").select("id, name").in("id", recipeIds)
    : { data: [] as Array<{ id: number; name: string }> };
  const nameById = new Map((recipeRows ?? []).map((r) => [r.id, r.name]));

  return {
    id: ev.id,
    clientId: ev.client_id,
    title: ev.title,
    eventDate: iso(ev.event_date),
    location: ev.location,
    attendees: ev.attendees,
    status: ev.status,
    estimatedCost: ev.estimated_cost,
    clientName: (client as { name: string } | null)?.name ?? "—",
    services: ((services as Array<{ service_type: ServiceType }> | null) ?? []).map(
      (s) => s.service_type,
    ),
    dietaryRestrictions: ev.dietary_restrictions,
    notes: ev.notes,
    recipes: ((recipes as Array<{
      id: number;
      recipe_id: number;
      service_type: ServiceType;
      portions: number;
    }> | null) ?? []).map((r) => ({
      id: r.id,
      recipeId: r.recipe_id,
      serviceType: r.service_type,
      portions: r.portions,
      recipeName: nameById.get(r.recipe_id) ?? "—",
    })),
    createdAt: iso(ev.created_at),
    updatedAt: iso(ev.updated_at),
  };
}

async function replaceEventChildren(
  eventId: number,
  services: ServiceType[],
  recipes: EventInput["recipes"],
): Promise<void> {
  const db = getSupabase();
  await db.from("event_services").delete().eq("event_id", eventId);
  await db.from("event_recipes").delete().eq("event_id", eventId);
  if (services.length) {
    const { error } = await db.from("event_services").insert(
      services.map((service_type) => ({ event_id: eventId, service_type })),
    );
    if (error) throw new Error(error.message);
  }
  if (recipes.length) {
    const { error } = await db.from("event_recipes").insert(
      recipes.map((r) => ({
        event_id: eventId,
        recipe_id: r.recipeId,
        service_type: r.serviceType,
        portions: r.portions,
      })),
    );
    if (error) throw new Error(error.message);
  }
}

async function replaceRecipeIngredients(
  recipeId: number,
  ingredients: RecipeInput["ingredients"],
): Promise<void> {
  const db = getSupabase();
  await db.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
  if (!ingredients.length) return;
  const { error } = await db.from("recipe_ingredients").insert(
    ingredients.map((i) => ({
      recipe_id: recipeId,
      ingredient_id: i.ingredientId,
      quantity: i.quantity,
    })),
  );
  if (error) throw new Error(error.message);
}

async function loadShoppingList(list: ShoppingListRow): Promise<ShoppingList> {
  const db = getSupabase();
  const { data: items, error } = await db
    .from("shopping_list_items")
    .select("*")
    .eq("shopping_list_id", list.id);
  if (error) throw new Error(error.message);

  const rows = (items as ShoppingItemRow[] | null) ?? [];
  const ingredientIds = rows.map((i) => i.ingredient_id);
  const { data: ings } = ingredientIds.length
    ? await db.from("ingredients").select("*").in("id", ingredientIds)
    : { data: [] as IngredientRow[] };
  const suppliersNeeded = [
    ...new Set(
      ((ings as IngredientRow[] | null) ?? [])
        .map((i) => i.supplier_id)
        .filter((id): id is number => id != null),
    ),
  ];
  const { data: suppliers } = suppliersNeeded.length
    ? await db.from("suppliers").select("id, name").in("id", suppliersNeeded)
    : { data: [] as Array<{ id: number; name: string }> };
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const ingById = new Map(((ings as IngredientRow[] | null) ?? []).map((i) => [i.id, i]));

  return {
    id: list.id,
    eventId: list.event_id,
    status: list.status,
    generatedAt: iso(list.generated_at),
    items: rows.map((i) => {
      const cat = ingById.get(i.ingredient_id);
      return {
        id: i.id,
        ingredientId: i.ingredient_id,
        quantity: i.quantity,
        unit: i.unit,
        purchased: i.purchased,
        name: cat?.name ?? "—",
        supplierId: cat?.supplier_id ?? null,
        supplierName: cat?.supplier_id ? (supplierName.get(cat.supplier_id) ?? null) : null,
        unitPrice: cat?.unit_price ?? null,
      };
    }),
  };
}

export const cloud = {
  health: async () => {
    const db = getSupabase();
    const { error } = await db.from("clients").select("id").limit(1);
    return { ok: true, db: !error };
  },

  async isEmpty(): Promise<boolean> {
    const db = getSupabase();
    const [{ count: c }, { count: e }, { count: r }] = await Promise.all([
      db.from("clients").select("*", { count: "exact", head: true }),
      db.from("events").select("*", { count: "exact", head: true }),
      db.from("recipes").select("*", { count: "exact", head: true }),
    ]);
    return (c ?? 0) === 0 && (e ?? 0) === 0 && (r ?? 0) === 0;
  },

  async clearAll(): Promise<{ ok: boolean }> {
    const db = getSupabase();
    // Orden seguro por FKs
    await db.from("shopping_list_items").delete().neq("id", 0);
    await db.from("shopping_lists").delete().neq("id", 0);
    await db.from("quotes").delete().neq("id", 0);
    await db.from("event_recipes").delete().neq("id", 0);
    await db.from("event_services").delete().neq("id", 0);
    await db.from("events").delete().neq("id", 0);
    await db.from("recipe_ingredients").delete().neq("id", 0);
    await db.from("recipes").delete().neq("id", 0);
    await db.from("ingredients").delete().neq("id", 0);
    await db.from("suppliers").delete().neq("id", 0);
    await db.from("clients").delete().neq("id", 0);
    return { ok: true };
  },

  async dashboard(): Promise<Dashboard> {
    const db = getSupabase();
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [
      { count: clients },
      { count: recipes },
      { count: events },
      { count: quotes },
      { count: pendingShoppingLists },
      { data: upcomingRows },
    ] = await Promise.all([
      db.from("clients").select("*", { count: "exact", head: true }),
      db.from("recipes").select("*", { count: "exact", head: true }),
      db.from("events").select("*", { count: "exact", head: true }),
      db.from("quotes").select("*", { count: "exact", head: true }),
      db.from("shopping_lists").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
      db
        .from("events")
        .select("*")
        .gte("event_date", now.toISOString())
        .lt("event_date", in14.toISOString())
        .neq("status", "cancelado")
        .order("event_date", { ascending: true })
        .limit(10),
    ]);

    const upcomingEv = (upcomingRows as EventRow[] | null) ?? [];
    const clientIds = [...new Set(upcomingEv.map((e) => e.client_id))];
    const { data: clientRows } = clientIds.length
      ? await db.from("clients").select("id, name").in("id", clientIds)
      : { data: [] as Array<{ id: number; name: string }> };
    const clientName = new Map((clientRows ?? []).map((c) => [c.id, c.name]));

    const upcoming = upcomingEv.map((e) => ({
      id: e.id,
      title: e.title,
      eventDate: iso(e.event_date),
      attendees: e.attendees,
      status: e.status,
      clientId: e.client_id,
      clientName: clientName.get(e.client_id) ?? "—",
    }));

    return {
      counts: {
        clients: clients ?? 0,
        recipes: recipes ?? 0,
        events: events ?? 0,
        quotes: quotes ?? 0,
        pendingShoppingLists: pendingShoppingLists ?? 0,
      },
      upcoming,
      alerts: {
        confirmedSoon: upcoming.filter((e) => e.status === "confirmado").length,
        needsAttention: upcoming.filter((e) => e.status === "borrador" || e.status === "cotizado")
          .length,
      },
    };
  },

  async listClients(): Promise<Client[]> {
    const { data, error } = await getSupabase().from("clients").select("*").order("name");
    return assertOk(data as ClientRow[] | null, error, "No se pudieron cargar clientes").map(
      mapClient,
    );
  },

  async getClient(id: number): Promise<Client> {
    const { data, error } = await getSupabase()
      .from("clients")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return mapClient(assertOk(data as ClientRow | null, error, "Cliente no encontrado"));
  },

  async createClient(body: ClientInput): Promise<Client> {
    const { data, error } = await getSupabase()
      .from("clients")
      .insert({
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        company: body.company ?? null,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();
    return mapClient(assertOk(data as ClientRow | null, error, "No se pudo crear el cliente"));
  },

  async updateClient(id: number, body: ClientInput): Promise<Client> {
    const { data, error } = await getSupabase()
      .from("clients")
      .update({
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        company: body.company ?? null,
        notes: body.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    return mapClient(assertOk(data as ClientRow | null, error, "Cliente no encontrado"));
  },

  async deleteClient(id: number): Promise<{ ok: boolean }> {
    const { count } = await getSupabase()
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("client_id", id);
    if ((count ?? 0) > 0) fail("No se puede eliminar: el cliente tiene eventos");
    const { error } = await getSupabase().from("clients").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async listSuppliers(): Promise<Supplier[]> {
    const { data, error } = await getSupabase().from("suppliers").select("*").order("name");
    return assertOk(data as SupplierRow[] | null, error, "No se pudieron cargar proveedores").map(
      mapSupplier,
    );
  },

  async createSupplier(body: SupplierInput): Promise<Supplier> {
    const { data, error } = await getSupabase()
      .from("suppliers")
      .insert({
        name: body.name,
        contact_name: body.contactName ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();
    return mapSupplier(assertOk(data as SupplierRow | null, error, "No se pudo crear el proveedor"));
  },

  async updateSupplier(id: number, body: SupplierInput): Promise<Supplier> {
    const { data, error } = await getSupabase()
      .from("suppliers")
      .update({
        name: body.name,
        contact_name: body.contactName ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        notes: body.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    return mapSupplier(assertOk(data as SupplierRow | null, error, "Proveedor no encontrado"));
  },

  async deleteSupplier(id: number): Promise<{ ok: boolean }> {
    await getSupabase().from("ingredients").update({ supplier_id: null }).eq("supplier_id", id);
    const { error } = await getSupabase().from("suppliers").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async listIngredients(): Promise<Ingredient[]> {
    const db = getSupabase();
    const { data, error } = await db.from("ingredients").select("*").order("name");
    const rows = assertOk(data as IngredientRow[] | null, error, "No se pudieron cargar ingredientes");
    const supplierIds = [
      ...new Set(rows.map((r) => r.supplier_id).filter((id): id is number => id != null)),
    ];
    const { data: suppliers } = supplierIds.length
      ? await db.from("suppliers").select("id, name").in("id", supplierIds)
      : { data: [] as Array<{ id: number; name: string }> };
    const names = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return rows.map((r) => mapIngredient(r, r.supplier_id ? names.get(r.supplier_id) : null));
  },

  async createIngredient(body: IngredientInput): Promise<Ingredient> {
    const { data, error } = await getSupabase()
      .from("ingredients")
      .insert({
        name: body.name,
        unit: body.unit,
        supplier_id: body.supplierId ?? null,
        unit_price: body.unitPrice ?? null,
        stock_qty: body.stockQty ?? 0,
      })
      .select("*")
      .single();
    const row = assertOk(data as IngredientRow | null, error, "No se pudo crear el ingrediente");
    let supplierName: string | null = null;
    if (row.supplier_id) {
      const { data: s } = await getSupabase()
        .from("suppliers")
        .select("name")
        .eq("id", row.supplier_id)
        .maybeSingle();
      supplierName = (s as { name: string } | null)?.name ?? null;
    }
    return mapIngredient(row, supplierName);
  },

  async updateIngredient(id: number, body: IngredientInput): Promise<Ingredient> {
    const { data, error } = await getSupabase()
      .from("ingredients")
      .update({
        name: body.name,
        unit: body.unit,
        supplier_id: body.supplierId ?? null,
        unit_price: body.unitPrice ?? null,
        stock_qty: body.stockQty ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    const row = assertOk(data as IngredientRow | null, error, "Ingrediente no encontrado");
    let supplierName: string | null = null;
    if (row.supplier_id) {
      const { data: s } = await getSupabase()
        .from("suppliers")
        .select("name")
        .eq("id", row.supplier_id)
        .maybeSingle();
      supplierName = (s as { name: string } | null)?.name ?? null;
    }
    return mapIngredient(row, supplierName);
  },

  async deleteIngredient(id: number): Promise<{ ok: boolean }> {
    const { count } = await getSupabase()
      .from("recipe_ingredients")
      .select("*", { count: "exact", head: true })
      .eq("ingredient_id", id);
    if ((count ?? 0) > 0) {
      fail("No se puede eliminar: el ingrediente está en uso en recetas o listas");
    }
    const { error } = await getSupabase().from("ingredients").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async listRecipes(): Promise<Recipe[]> {
    const { data, error } = await getSupabase().from("recipes").select("id").order("name");
    const ids = assertOk(data as Array<{ id: number }> | null, error, "No se pudieron cargar recetas");
    return Promise.all(ids.map((r) => loadRecipe(r.id)));
  },

  getRecipe: (id: number) => loadRecipe(id),

  async createRecipe(body: RecipeInput): Promise<Recipe> {
    const category = body.category?.startsWith("svc:") ? null : body.category ?? null;
    const { data, error } = await getSupabase()
      .from("recipes")
      .insert({
        name: body.name,
        yield_portions: body.yieldPortions,
        category,
        suitable_services: body.suitableServices ?? [],
        instructions: body.instructions ?? null,
        estimated_cost: body.estimatedCost ?? null,
      })
      .select("*")
      .single();
    const row = assertOk(data as RecipeRow | null, error, "No se pudo crear la receta");
    await replaceRecipeIngredients(row.id, body.ingredients);
    return loadRecipe(row.id);
  },

  async updateRecipe(id: number, body: RecipeInput): Promise<Recipe> {
    const category = body.category?.startsWith("svc:") ? null : body.category ?? null;
    const { data, error } = await getSupabase()
      .from("recipes")
      .update({
        name: body.name,
        yield_portions: body.yieldPortions,
        category,
        suitable_services: body.suitableServices ?? [],
        instructions: body.instructions ?? null,
        estimated_cost: body.estimatedCost ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    assertOk(data as RecipeRow | null, error, "Receta no encontrada");
    await replaceRecipeIngredients(id, body.ingredients);
    return loadRecipe(id);
  },

  async deleteRecipe(id: number): Promise<{ ok: boolean }> {
    const { count } = await getSupabase()
      .from("event_recipes")
      .select("*", { count: "exact", head: true })
      .eq("recipe_id", id);
    if ((count ?? 0) > 0) fail("No se puede eliminar: la receta está en uso en eventos");
    const { error } = await getSupabase().from("recipes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async listEvents(): Promise<EventSummary[]> {
    const db = getSupabase();
    const { data, error } = await db.from("events").select("*").order("event_date", {
      ascending: false,
    });
    const rows = assertOk(data as EventRow[] | null, error, "No se pudieron cargar eventos");
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const clientIds = [...new Set(rows.map((r) => r.client_id))];
    const [{ data: clients }, { data: services }] = await Promise.all([
      db.from("clients").select("id, name").in("id", clientIds),
      db.from("event_services").select("event_id, service_type").in("event_id", ids),
    ]);
    const clientName = new Map((clients ?? []).map((c) => [c.id as number, c.name as string]));
    const servicesByEvent = new Map<number, ServiceType[]>();
    for (const s of (services as Array<{ event_id: number; service_type: ServiceType }> | null) ??
      []) {
      const list = servicesByEvent.get(s.event_id) ?? [];
      list.push(s.service_type);
      servicesByEvent.set(s.event_id, list);
    }

    return rows.map((ev) => ({
      id: ev.id,
      clientId: ev.client_id,
      title: ev.title,
      eventDate: iso(ev.event_date),
      location: ev.location,
      attendees: ev.attendees,
      status: ev.status,
      estimatedCost: ev.estimated_cost,
      clientName: clientName.get(ev.client_id) ?? "—",
      services: servicesByEvent.get(ev.id) ?? [],
    }));
  },

  getEvent: (id: number) => loadEventDetail(id),

  async createEvent(body: EventInput): Promise<EventDetail> {
    const db = getSupabase();
    const { data: client } = await db
      .from("clients")
      .select("id")
      .eq("id", body.clientId)
      .maybeSingle();
    if (!client) fail("Debes elegir un cliente");

    const { data, error } = await db
      .from("events")
      .insert({
        client_id: body.clientId,
        title: body.title,
        event_date: body.eventDate,
        location: body.location ?? null,
        attendees: body.attendees,
        status: body.status,
        dietary_restrictions: body.dietaryRestrictions ?? null,
        notes: body.notes ?? null,
        estimated_cost: body.estimatedCost ?? null,
      })
      .select("*")
      .single();
    const row = assertOk(data as EventRow | null, error, "No se pudo crear el evento");
    await replaceEventChildren(row.id, body.services, body.recipes);
    return loadEventDetail(row.id);
  },

  async updateEvent(id: number, body: EventInput): Promise<EventDetail> {
    const { data, error } = await getSupabase()
      .from("events")
      .update({
        client_id: body.clientId,
        title: body.title,
        event_date: body.eventDate,
        location: body.location ?? null,
        attendees: body.attendees,
        status: body.status,
        dietary_restrictions: body.dietaryRestrictions ?? null,
        notes: body.notes ?? null,
        estimated_cost: body.estimatedCost ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    assertOk(data as EventRow | null, error, "Evento no encontrado");
    await replaceEventChildren(id, body.services, body.recipes);
    return loadEventDetail(id);
  },

  async deleteEvent(id: number): Promise<{ ok: boolean }> {
    const { error } = await getSupabase().from("events").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async getShoppingList(eventId: number, regenerate = false): Promise<ShoppingList> {
    const db = getSupabase();
    const { data: existing } = await db
      .from("shopping_lists")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing && !regenerate) {
      return loadShoppingList(existing as ShoppingListRow);
    }

    const detail = await loadEventDetail(eventId);
    const stockById = new Map<number, number>();
    const recipesForShopping = await Promise.all(
      detail.recipes.map(async (er) => {
        const recipe = await loadRecipe(er.recipeId);
        const ingredientIds = recipe.ingredients.map((i) => i.ingredientId);
        const { data: ings } = ingredientIds.length
          ? await db.from("ingredients").select("*").in("id", ingredientIds)
          : { data: [] as IngredientRow[] };
        const suppliersNeeded = [
          ...new Set(
            ((ings as IngredientRow[] | null) ?? [])
              .map((i) => i.supplier_id)
              .filter((id): id is number => id != null),
          ),
        ];
        const { data: suppliers } = suppliersNeeded.length
          ? await db.from("suppliers").select("id, name").in("id", suppliersNeeded)
          : { data: [] as Array<{ id: number; name: string }> };
        const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
        const byId = new Map(((ings as IngredientRow[] | null) ?? []).map((i) => [i.id, i]));
        for (const [id, row] of byId) {
          stockById.set(id, row.stock_qty ?? 0);
        }

        return {
          yieldPortions: recipe.yieldPortions,
          portions: er.portions,
          ingredients: recipe.ingredients.map((ing) => {
            const cat = byId.get(ing.ingredientId);
            return {
              ingredientId: ing.ingredientId,
              name: cat?.name ?? ing.name,
              unit: cat?.unit ?? ing.unit,
              quantity: ing.quantity,
              supplierId: cat?.supplier_id ?? null,
              supplierName: cat?.supplier_id
                ? (supplierName.get(cat.supplier_id) ?? null)
                : null,
              unitPrice: cat?.unit_price ?? null,
            };
          }),
        };
      }),
    );

    const lines = buildShoppingLines(recipesForShopping)
      .map((l) => {
        const stock = stockById.get(l.ingredientId) ?? 0;
        return { ...l, quantity: roundQty(Math.max(0, l.quantity - stock)) };
      })
      .filter((l) => l.quantity > 0);

    if (existing) {
      await db.from("shopping_lists").delete().eq("id", (existing as ShoppingListRow).id);
    }

    const { data: listRow, error } = await db
      .from("shopping_lists")
      .insert({ event_id: eventId, status: "pendiente" })
      .select("*")
      .single();
    const list = assertOk(listRow as ShoppingListRow | null, error, "No se pudo generar la lista");

    if (lines.length) {
      const { error: itemErr } = await db.from("shopping_list_items").insert(
        lines.map((l) => ({
          shopping_list_id: list.id,
          ingredient_id: l.ingredientId,
          quantity: l.quantity,
          unit: l.unit,
          purchased: false,
        })),
      );
      if (itemErr) throw new Error(itemErr.message);
    }

    return loadShoppingList(list);
  },

  async updateShoppingList(
    eventId: number,
    body: { items?: Array<{ id: number; purchased: boolean }>; status?: ShoppingListStatus },
  ): Promise<ShoppingList> {
    const db = getSupabase();
    const { data: list, error } = await db
      .from("shopping_lists")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();
    const row = assertOk(
      list as ShoppingListRow | null,
      error,
      "No hay lista de compras. Genérala primero.",
    );

    if (body.status) {
      const { error: stErr } = await db
        .from("shopping_lists")
        .update({ status: body.status })
        .eq("id", row.id);
      if (stErr) throw new Error(stErr.message);
    }
    if (body.items) {
      for (const patch of body.items) {
        const { error: pErr } = await db
          .from("shopping_list_items")
          .update({ purchased: patch.purchased })
          .eq("id", patch.id)
          .eq("shopping_list_id", row.id);
        if (pErr) throw new Error(pErr.message);
      }
    }

    const { data: refreshed } = await db
      .from("shopping_lists")
      .select("*")
      .eq("id", row.id)
      .single();
    return loadShoppingList(assertOk(refreshed as ShoppingListRow | null, null, "Lista no encontrada"));
  },

  async listQuotes(): Promise<QuoteSummary[]> {
    const db = getSupabase();
    const { data, error } = await db.from("quotes").select("*").order("quote_date", {
      ascending: false,
    });
    const rows = assertOk(data as QuoteRow[] | null, error, "No se pudieron cargar cotizaciones");
    if (!rows.length) return [];

    const eventIds = [...new Set(rows.map((q) => q.event_id))];
    const { data: events } = await db
      .from("events")
      .select("id, title, client_id")
      .in("id", eventIds);
    const eventMap = new Map(
      ((events as Array<{ id: number; title: string; client_id: number }> | null) ?? []).map((e) => [
        e.id,
        e,
      ]),
    );
    const clientIds = [...new Set([...eventMap.values()].map((e) => e.client_id))];
    const { data: clients } = clientIds.length
      ? await db.from("clients").select("id, name").in("id", clientIds)
      : { data: [] as Array<{ id: number; name: string }> };
    const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));

    return rows.map((q) => {
      const ev = eventMap.get(q.event_id);
      return {
        id: q.id,
        eventId: q.event_id,
        quoteNumber: q.quote_number,
        quoteDate: iso(q.quote_date),
        items: q.items ?? [],
        total: q.total,
        notes: q.notes,
        status: q.status,
        depositAmount: q.deposit_amount ?? 0,
        eventTitle: ev?.title ?? "—",
        clientName: ev ? (clientName.get(ev.client_id) ?? "—") : "—",
        createdAt: iso(q.created_at),
      };
    });
  },

  async getQuote(id: number): Promise<QuoteDetail> {
    const db = getSupabase();
    const { data, error } = await db.from("quotes").select("*").eq("id", id).maybeSingle();
    const q = assertOk(data as QuoteRow | null, error, "Cotización no encontrada");
    const { data: ev } = await db.from("events").select("*").eq("id", q.event_id).maybeSingle();
    const event = ev as EventRow | null;
    const { data: client } = event
      ? await db.from("clients").select("*").eq("id", event.client_id).maybeSingle()
      : { data: null };
    const c = client as ClientRow | null;

    return {
      id: q.id,
      eventId: q.event_id,
      quoteNumber: q.quote_number,
      quoteDate: iso(q.quote_date),
      items: q.items ?? [],
      total: q.total,
      notes: q.notes,
      status: q.status,
      depositAmount: q.deposit_amount ?? 0,
      eventTitle: event?.title ?? "—",
      clientName: c?.name ?? "—",
      createdAt: iso(q.created_at),
      eventDate: event ? iso(event.event_date) : "",
      attendees: event?.attendees ?? 0,
      location: event?.location ?? null,
      clientEmail: c?.email ?? null,
      clientPhone: c?.phone ?? null,
      clientCompany: c?.company ?? null,
      updatedAt: iso(q.updated_at),
    };
  },

  async createQuote(body: QuoteInput): Promise<QuoteDetail> {
    const db = getSupabase();
    const { data: ev } = await db.from("events").select("id").eq("id", body.eventId).maybeSingle();
    if (!ev) fail("Debes vincular la cotización a un evento");

    const { data, error } = await db
      .from("quotes")
      .insert({
        event_id: body.eventId,
        quote_number: body.quoteNumber ?? null,
        quote_date: body.quoteDate ?? new Date().toISOString(),
        items: body.items,
        total: quoteTotal(body.items),
        notes: body.notes ?? null,
        status: body.status,
        deposit_amount: normalizeDeposit(body.depositAmount),
      })
      .select("*")
      .single();
    const row = assertOk(data as QuoteRow | null, error, "No se pudo crear la cotización");
    await syncEventFromQuote(body.eventId, body.status);
    return cloud.getQuote(row.id);
  },

  async updateQuote(id: number, body: QuoteInput): Promise<QuoteDetail> {
    const { data, error } = await getSupabase()
      .from("quotes")
      .update({
        event_id: body.eventId,
        quote_number: body.quoteNumber ?? null,
        quote_date: body.quoteDate ?? new Date().toISOString(),
        items: body.items,
        total: quoteTotal(body.items),
        notes: body.notes ?? null,
        status: body.status,
        deposit_amount: normalizeDeposit(body.depositAmount),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    assertOk(data as QuoteRow | null, error, "Cotización no encontrada");
    await syncEventFromQuote(body.eventId, body.status);
    return cloud.getQuote(id);
  },

  async deleteQuote(id: number): Promise<{ ok: boolean }> {
    const { error } = await getSupabase().from("quotes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
