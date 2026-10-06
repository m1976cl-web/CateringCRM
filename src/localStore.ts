import { applyPurchaseToStock, buildShoppingLines, convertQuantity, quantityAfterStock, roundQty } from "../shared/shopping";
import {
  clampStock,
  isOpenPurchaseStatus,
  isStockMovementKind,
  movementDelta,
  pendingOrderGroups,
  type PurchaseOrderStatus,
  type StockMovementKind,
} from "../shared/procurement";
import { hashPassword, normalizeRecoveryCode, randomRecoveryCode, randomToken, sha256Hex, verifyPassword } from "../shared/password";
import {
  defaultPackingItems,
  parseDietaryTags,
  parseExpenses,
  parsePackingItems,
  parseStaff,
  parseTimeHm,
  type DietaryTag,
  type EventExpense,
  type EventStaff,
  type PackingItem,
} from "../shared/ops";
import {
  canDeleteCatalog,
  canEditClients,
  canEditPrices,
  canEditQuotes,
  canManageUsers,
  normalizeRole,
  type TeamRole,
} from "../shared/roles";
import { isQuoteOfferOpen, resolveValidUntil } from "../shared/quoteOffer";
import { isQuoteSuperseded } from "../shared/quoteHistory";
import { DEMO_USER_EMAIL, DEMO_USER_NAME, parseDemoLoginFlag } from "../shared/demoLogin";
import {
  quoteTotal,
  type ClientInput,
  type EventInput,
  type IngredientInput,
  type IngredientUnit,
  type QuoteInput,
  type QuoteStatus,
  type RecipeInput,
  type ServiceType,
  type ShoppingListStatus,
  type SupplierInput,
} from "../shared/types";
import {
  eventStatusAfterQuote,
  paymentsFromQuoteInput,
  sumPayments,
} from "../shared/quoteLifecycle";
import type {
  AuthUser,
  Client,
  Dashboard,
  EventDetail,
  EventSummary,
  Ingredient,
  PurchaseOrder,
  QuoteDetail,
  StockMovement,
  QuotePayment,
  QuoteSummary,
  Recipe,
  ShoppingList,
  Supplier,
} from "./api";
import { getSessionToken } from "./session";
const KEY = "catering-crm:v1";

type Store = {
  clients: Client[];
  suppliers: Supplier[];
  ingredients: Array<Omit<Ingredient, "supplierName">>;
  recipes: Recipe[];
  events: Array<{
    id: number;
    clientId: number;
    title: string;
    eventDate: string;
    location: string | null;
    attendees: number;
    status: EventDetail["status"];
    dietaryRestrictions: string | null;
    dietaryTags: DietaryTag[];
    setupTime: string | null;
    serviceTime: string | null;
    endTime: string | null;
    venueContact: string | null;
    venuePhone: string | null;
    packingItems: PackingItem[];
    expenses: EventExpense[];
    staff: EventStaff[];
    notes: string | null;
    estimatedCost: number | null;
    services: ServiceType[];
    recipes: Array<{
      id: number;
      recipeId: number;
      serviceType: ServiceType;
      portions: number;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  quotes: Array<{
    id: number;
    eventId: number;
    quoteNumber: string | null;
    quoteDate: string;
    items: QuoteDetail["items"];
    total: number;
    notes: string | null;
    status: QuoteDetail["status"];
    depositAmount: number;
    foodCost: number;
    payments: QuotePayment[];
    version: number;
    parentQuoteId: number | null;
    publicToken: string | null;
    dueDate: string | null;
    validUntil: string | null;
    lastContactedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  shoppingLists: Array<{
    id: number;
    eventId: number;
    status: ShoppingListStatus;
    generatedAt: string;
    items: ShoppingList["items"];
  }>;
  teamUsers: Array<{
    id: number;
    email: string;
    name: string;
    passwordSalt: string;
    passwordHash: string;
    role: TeamRole;
    recoverySalt?: string | null;
    recoveryHash?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  teamSessions: Array<{
    id: number;
    userId: number;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
  }>;
  teamRecovery: { salt: string; hash: string; createdAt: string } | null;
  ingredientPrices: Array<{ id: number; ingredientId: number; unitPrice: number; recordedAt: string }>;
  stockMovements: Array<{
    id: number;
    ingredientId: number;
    qty: number;
    kind: StockMovementKind;
    note: string | null;
    eventId: number | null;
    purchaseOrderId: number | null;
    createdAt: string;
  }>;
  purchaseOrders: Array<{
    id: number;
    supplierId: number | null;
    eventId: number | null;
    status: PurchaseOrderStatus;
    invoiceNumber: string | null;
    invoiceTotal: number | null;
    notes: string | null;
    orderedAt: string;
    receivedAt: string | null;
    createdAt: string;
    updatedAt: string;
    items: Array<{
      id: number;
      ingredientId: number;
      quantity: number;
      unit: IngredientUnit;
      unitPrice: number;
      receivedQty: number;
    }>;
  }>;
  seq: Record<string, number>;
};

function empty(): Store {
  return {
    clients: [],
    suppliers: [],
    ingredients: [],
    recipes: [],
    events: [],
    quotes: [],
    shoppingLists: [],
    teamUsers: [],
    teamSessions: [],
    teamRecovery: null,
    ingredientPrices: [],
    stockMovements: [],
    purchaseOrders: [],
    seq: {},
  };
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = { ...empty(), ...(JSON.parse(raw) as Store) } as Store;
    parsed.teamUsers = parsed.teamUsers ?? [];
    parsed.teamSessions = parsed.teamSessions ?? [];
    parsed.teamRecovery = parsed.teamRecovery ?? null;
    parsed.quotes = parsed.quotes.map(normalizeStoredQuote);
    parsed.ingredientPrices = parsed.ingredientPrices ?? [];
    parsed.stockMovements = parsed.stockMovements ?? [];
    parsed.purchaseOrders = parsed.purchaseOrders ?? [];
    parsed.events = parsed.events.map((ev) => ({
      ...ev,
      dietaryTags: parseDietaryTags(ev.dietaryTags),
      setupTime: ev.setupTime ?? null,
      serviceTime: ev.serviceTime ?? null,
      endTime: ev.endTime ?? null,
      venueContact: ev.venueContact ?? null,
      venuePhone: ev.venuePhone ?? null,
      packingItems: parsePackingItems(ev.packingItems).length
        ? parsePackingItems(ev.packingItems)
        : defaultPackingItems(),
      expenses: parseExpenses(ev.expenses),
      staff: parseStaff(ev.staff),
    }));
    parsed.recipes = parsed.recipes.map((r) => ({
      ...r,
      imageUrl: r.imageUrl ?? null,
      allergenTags: parseDietaryTags(r.allergenTags),
    }));
    parsed.teamUsers = parsed.teamUsers.map((u) => ({ ...u, role: normalizeRole(u.role) }));
    const hadMissingToken = ((JSON.parse(raw) as Store).quotes ?? []).some((q) => !q.publicToken);
    if (hadMissingToken) write(parsed);
    return parsed;
  } catch {
    return empty();
  }
}

function write(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function nextId(store: Store, table: string): number {
  const n = (store.seq[table] ?? 0) + 1;
  store.seq[table] = n;
  return n;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeStoredQuote(q: Store["quotes"][number]): Store["quotes"][number] {
  const existing = Array.isArray(q.payments) ? q.payments : [];
  const payments =
    existing.length > 0
      ? existing
      : q.depositAmount > 0
        ? [
            {
              id: 1,
              amount: q.depositAmount,
              paidAt: q.updatedAt ?? q.createdAt,
              method: "transferencia" as const,
              notes: "Anticipo",
            },
          ]
        : [];
  return {
    ...q,
    foodCost: q.foodCost ?? 0,
    payments,
    depositAmount: sumPayments(payments),
    version: q.version ?? 1,
    parentQuoteId: q.parentQuoteId ?? null,
    publicToken: q.publicToken || randomToken().slice(0, 32),
    dueDate: q.dueDate ?? null,
    validUntil: q.validUntil ?? null,
    lastContactedAt: q.lastContactedAt ?? null,
  };
}

function withSupplierName(
  store: Store,
  row: Omit<Ingredient, "supplierName">,
): Ingredient {
  const supplier = row.supplierId
    ? store.suppliers.find((s) => s.id === row.supplierId)
    : undefined;
  return {
    ...row,
    stockQty: row.stockQty ?? 0,
    minStock: row.minStock ?? 0,
    supplierName: supplier?.name ?? null,
  };
}

function eventSummary(store: Store, ev: Store["events"][number]): EventSummary {
  const client = store.clients.find((c) => c.id === ev.clientId);
  return {
    id: ev.id,
    clientId: ev.clientId,
    title: ev.title,
    eventDate: ev.eventDate,
    location: ev.location,
    attendees: ev.attendees,
    status: ev.status,
    estimatedCost: ev.estimatedCost,
    clientName: client?.name ?? "—",
    services: ev.services,
    setupTime: ev.setupTime ?? null,
    serviceTime: ev.serviceTime ?? null,
  };
}

function eventDetail(store: Store, ev: Store["events"][number]): EventDetail {
  return {
    ...eventSummary(store, ev),
    dietaryRestrictions: ev.dietaryRestrictions,
    dietaryTags: parseDietaryTags(ev.dietaryTags),
    setupTime: ev.setupTime ?? null,
    serviceTime: ev.serviceTime ?? null,
    endTime: ev.endTime ?? null,
    venueContact: ev.venueContact ?? null,
    venuePhone: ev.venuePhone ?? null,
    packingItems: parsePackingItems(ev.packingItems).length
      ? parsePackingItems(ev.packingItems)
      : defaultPackingItems(),
    expenses: parseExpenses(ev.expenses),
    staff: parseStaff(ev.staff),
    notes: ev.notes,
    recipes: ev.recipes.map((r) => ({
      ...r,
      recipeName: store.recipes.find((x) => x.id === r.recipeId)?.name ?? "—",
    })),
    createdAt: ev.createdAt,
    updatedAt: ev.updatedAt,
  };
}

function quoteSummary(store: Store, q: Store["quotes"][number]): QuoteSummary {
  const ev = store.events.find((e) => e.id === q.eventId);
  const client = ev ? store.clients.find((c) => c.id === ev.clientId) : undefined;
  return {
    id: q.id,
    eventId: q.eventId,
    quoteNumber: q.quoteNumber,
    quoteDate: q.quoteDate,
    items: q.items,
    total: q.total,
    notes: q.notes,
    status: q.status,
    depositAmount: q.depositAmount ?? 0,
    foodCost: q.foodCost ?? 0,
    payments: q.payments ?? [],
    eventTitle: ev?.title ?? "—",
    clientName: client?.name ?? "—",
    clientPhone: client?.phone ?? null,
    createdAt: q.createdAt,
    version: q.version ?? 1,
    parentQuoteId: q.parentQuoteId ?? null,
    publicToken: q.publicToken ?? null,
    dueDate: q.dueDate ?? null,
    validUntil: q.validUntil ?? null,
    lastContactedAt: q.lastContactedAt ?? null,
  };
}

function quoteDetail(store: Store, q: Store["quotes"][number]): QuoteDetail {
  const ev = store.events.find((e) => e.id === q.eventId);
  const client = ev ? store.clients.find((c) => c.id === ev.clientId) : undefined;
  return {
    ...quoteSummary(store, q),
    eventDate: ev?.eventDate ?? "",
    attendees: ev?.attendees ?? 0,
    location: ev?.location ?? null,
    clientEmail: client?.email ?? null,
    clientPhone: client?.phone ?? null,
    clientCompany: client?.company ?? null,
    updatedAt: q.updatedAt,
  };
}

function syncEventStatusFromQuote(store: Store, eventId: number, quoteStatus: QuoteStatus) {
  const ev = store.events.find((e) => e.id === eventId);
  if (!ev) return;
  const next = eventStatusAfterQuote(ev.status, quoteStatus);
  if (next === ev.status) return;
  ev.status = next;
  ev.updatedAt = nowIso();
}

function toPublicUser(row: Store["teamUsers"][number]): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: normalizeRole(row.role) };
}

function eventOpsFromBody(body: EventInput) {
  const packing = parsePackingItems(body.packingItems);
  return {
    dietaryTags: parseDietaryTags(body.dietaryTags),
    setupTime: parseTimeHm(body.setupTime),
    serviceTime: parseTimeHm(body.serviceTime),
    endTime: parseTimeHm(body.endTime),
    venueContact: body.venueContact?.trim() || null,
    venuePhone: body.venuePhone?.trim() || null,
    packingItems: packing.length ? packing : defaultPackingItems(),
    expenses: parseExpenses(body.expenses),
    staff: parseStaff(body.staff),
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function localSessionUser(store: Store): Promise<AuthUser | null> {
  const token = getSessionToken();
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = store.teamSessions.find(
    (s) => s.tokenHash === tokenHash && new Date(s.expiresAt).getTime() > Date.now(),
  );
  if (!session) return null;
  const user = store.teamUsers.find((u) => u.id === session.userId);
  return user ? toPublicUser(user) : null;
}

async function createLocalSession(store: Store, userId: number): Promise<string> {
  const token = randomToken();
  store.teamSessions.push({
    id: nextId(store, "teamSessions"),
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: nowIso(),
  });
  return token;
}

async function assertCan(store: Store, allowed: (role: TeamRole) => boolean): Promise<AuthUser | null> {
  if (store.teamUsers.length === 0) return null;
  const user = await localSessionUser(store);
  if (!user) fail("Inicia sesión para continuar");
  if (!allowed(user.role)) fail("No tienes permiso para esta acción");
  return user;
}

async function issueLocalRecovery(store: Store, userId: number): Promise<string> {
  const code = randomRecoveryCode();
  const hashed = await hashPassword(normalizeRecoveryCode(code));
  const user = store.teamUsers.find((row) => row.id === userId);
  if (!user) fail("Usuario no encontrado");
  user.recoverySalt = hashed.salt;
  user.recoveryHash = hashed.hash;
  user.updatedAt = nowIso();
  store.teamRecovery = null;
  return code;
}

function localDemoEnabled(): boolean {
  return parseDemoLoginFlag(import.meta.env.VITE_DEMO_LOGIN);
}

function paymentsForBody(store: Store, body: QuoteInput): QuotePayment[] {
  return paymentsFromQuoteInput(body).map((p) => ({
    id: nextId(store, "quotePayments"),
    amount: p.amount,
    paidAt: p.paidAt,
    method: p.method,
    notes: p.notes ?? null,
  }));
}

function fail(message: string): never {
  throw new Error(message);
}

function applyLocalDelta(
  store: Store,
  ingredientId: number,
  delta: number,
  kind: StockMovementKind,
  meta: { note?: string | null; eventId?: number | null; purchaseOrderId?: number | null },
): number {
  const idx = store.ingredients.findIndex((ing) => ing.id === ingredientId);
  if (idx < 0) fail("Ingrediente no encontrado");
  const ing = store.ingredients[idx];
  const { next, applied } = clampStock(ing.stockQty ?? 0, delta);
  if (applied === 0) return 0;
  store.ingredients[idx] = { ...ing, stockQty: next, updatedAt: nowIso() };
  store.stockMovements.push({
    id: nextId(store, "stockMovements"),
    ingredientId,
    qty: applied,
    kind,
    note: meta.note ?? null,
    eventId: meta.eventId ?? null,
    purchaseOrderId: meta.purchaseOrderId ?? null,
    createdAt: nowIso(),
  });
  return applied;
}

function logLocalMovement(
  store: Store,
  ingredientId: number,
  qty: number,
  kind: StockMovementKind,
  meta: { note?: string | null; eventId?: number | null; purchaseOrderId?: number | null },
): void {
  if (qty === 0) return;
  store.stockMovements.push({
    id: nextId(store, "stockMovements"),
    ingredientId,
    qty,
    kind,
    note: meta.note ?? null,
    eventId: meta.eventId ?? null,
    purchaseOrderId: meta.purchaseOrderId ?? null,
    createdAt: nowIso(),
  });
}

function toStockMovement(store: Store, row: Store["stockMovements"][number]): StockMovement {
  const ing = store.ingredients.find((item) => item.id === row.ingredientId);
  const event = row.eventId ? store.events.find((item) => item.id === row.eventId) : undefined;
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    ingredientName: ing?.name ?? "Ingrediente",
    unit: ing?.unit ?? "unidad",
    qty: row.qty,
    kind: row.kind,
    note: row.note,
    eventId: row.eventId,
    eventTitle: event?.title ?? null,
    purchaseOrderId: row.purchaseOrderId,
    createdAt: row.createdAt,
  };
}

function toPurchaseOrder(store: Store, row: Store["purchaseOrders"][number]): PurchaseOrder {
  const supplier = row.supplierId ? store.suppliers.find((item) => item.id === row.supplierId) : undefined;
  const event = row.eventId ? store.events.find((item) => item.id === row.eventId) : undefined;
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: supplier?.name ?? null,
    eventId: row.eventId,
    eventTitle: event?.title ?? null,
    status: row.status,
    invoiceNumber: row.invoiceNumber,
    invoiceTotal: row.invoiceTotal,
    notes: row.notes,
    orderedAt: row.orderedAt,
    receivedAt: row.receivedAt,
    items: row.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      name: store.ingredients.find((ing) => ing.id === item.ingredientId)?.name ?? "Ingrediente",
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      receivedQty: item.receivedQty,
    })),
  };
}

export const local = {
  health: () => ({ ok: true, db: false }),

  isEmpty(): boolean {
    const store = read();
    return (
      store.clients.length === 0 &&
      store.events.length === 0 &&
      store.recipes.length === 0 &&
      store.ingredients.length === 0
    );
  },

  clearAll(): { ok: boolean } {
    write(empty());
    return { ok: true };
  },

  exportJson(): string {
    return JSON.stringify(read(), null, 2);
  },

  importJson(json: string): { ok: boolean } {
    const data = JSON.parse(json) as Store;
    if (!data || !Array.isArray(data.clients)) fail("Archivo de respaldo inválido");
    write({ ...empty(), ...data, seq: data.seq ?? {} });
    return { ok: true };
  },

  dashboard(): Dashboard {
    const store = read();
    const now = Date.now();
    const in14 = now + 14 * 24 * 60 * 60 * 1000;
    const upcoming = store.events
      .filter((e) => {
        const t = new Date(e.eventDate).getTime();
        return t >= now && t < in14 && e.status !== "cancelado";
      })
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        title: e.title,
        eventDate: e.eventDate,
        attendees: e.attendees,
        status: e.status,
        clientId: e.clientId,
        clientName: store.clients.find((c) => c.id === e.clientId)?.name ?? "—",
      }));

    return {
      counts: {
        clients: store.clients.length,
        recipes: store.recipes.length,
        events: store.events.length,
        quotes: store.quotes.length,
        pendingShoppingLists: store.shoppingLists.filter((l) => l.status === "pendiente").length,
      },
      upcoming,
      alerts: {
        confirmedSoon: upcoming.filter((e) => e.status === "confirmado").length,
        needsAttention: upcoming.filter((e) => e.status === "borrador" || e.status === "cotizado")
          .length,
      },
    };
  },

  listClients: () => read().clients.slice().sort((a, b) => a.name.localeCompare(b.name, "es")),
  getClient(id: number) {
    return read().clients.find((c) => c.id === id) ?? fail("Cliente no encontrado");
  },
  async createClient(body: ClientInput) {
    const store = read();
    await assertCan(store, canEditClients);
    const row: Client = {
      id: nextId(store, "clients"),
      name: body.name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      company: body.company ?? null,
      notes: body.notes ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.clients.push(row);
    write(store);
    return row;
  },
  async updateClient(id: number, body: ClientInput) {
    const store = read();
    await assertCan(store, canEditClients);
    const idx = store.clients.findIndex((c) => c.id === id);
    if (idx < 0) fail("Cliente no encontrado");
    store.clients[idx] = {
      ...store.clients[idx],
      name: body.name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      company: body.company ?? null,
      notes: body.notes ?? null,
      updatedAt: nowIso(),
    };
    write(store);
    return store.clients[idx];
  },
  async deleteClient(id: number) {
    const store = read();
    await assertCan(store, canDeleteCatalog);
    if (store.events.some((e) => e.clientId === id)) {
      fail("No se puede eliminar: el cliente tiene eventos");
    }
    store.clients = store.clients.filter((c) => c.id !== id);
    write(store);
    return { ok: true };
  },

  listSuppliers: () =>
    read().suppliers.slice().sort((a, b) => a.name.localeCompare(b.name, "es")),
  async createSupplier(body: SupplierInput) {
    const store = read();
    await assertCan(store, canEditClients);
    const row: Supplier = {
      id: nextId(store, "suppliers"),
      name: body.name,
      contactName: body.contactName ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      notes: body.notes ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.suppliers.push(row);
    write(store);
    return row;
  },
  async updateSupplier(id: number, body: SupplierInput) {
    const store = read();
    await assertCan(store, canEditClients);
    const idx = store.suppliers.findIndex((s) => s.id === id);
    if (idx < 0) fail("Proveedor no encontrado");
    store.suppliers[idx] = {
      ...store.suppliers[idx],
      name: body.name,
      contactName: body.contactName ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      notes: body.notes ?? null,
      updatedAt: nowIso(),
    };
    write(store);
    return store.suppliers[idx];
  },
  async deleteSupplier(id: number) {
    const store = read();
    await assertCan(store, canDeleteCatalog);
    store.suppliers = store.suppliers.filter((s) => s.id !== id);
    store.ingredients = store.ingredients.map((i) =>
      i.supplierId === id ? { ...i, supplierId: null } : i,
    );
    write(store);
    return { ok: true };
  },

  listIngredients() {
    const store = read();
    return store.ingredients
      .map((i) => ({
        ...withSupplierName(store, i),
        priceHistory: store.ingredientPrices
          .filter((p) => p.ingredientId === i.id)
          .map((p) => ({ id: p.id, unitPrice: p.unitPrice, recordedAt: p.recordedAt })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  },
  async createIngredient(body: IngredientInput) {
    const store = read();
    await assertCan(store, canEditPrices);
    const row = {
      id: nextId(store, "ingredients"),
      name: body.name,
      unit: body.unit,
      supplierId: body.supplierId ?? null,
      unitPrice: body.unitPrice ?? null,
      stockQty: 0,
      minStock: Math.max(0, body.minStock ?? 0),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.ingredients.push(row);
    const initial = Math.max(0, body.stockQty ?? 0);
    if (initial > 0) {
      applyLocalDelta(store, row.id, initial, "entrada", { note: "Stock inicial" });
      row.stockQty = store.ingredients.find((ing) => ing.id === row.id)?.stockQty ?? initial;
    }
    if (row.unitPrice != null) {
      store.ingredientPrices.push({
        id: nextId(store, "ingredientPrices"),
        ingredientId: row.id,
        unitPrice: row.unitPrice,
        recordedAt: nowIso(),
      });
    }
    write(store);
    return withSupplierName(store, row);
  },
  async updateIngredient(id: number, body: IngredientInput) {
    const store = read();
    await assertCan(store, canEditPrices);
    const idx = store.ingredients.findIndex((i) => i.id === id);
    if (idx < 0) fail("Ingrediente no encontrado");
    const prev = store.ingredients[idx];
    const desiredStock = Math.max(0, body.stockQty ?? prev.stockQty ?? 0);
    const stockDelta = roundQty(desiredStock - (prev.stockQty ?? 0));
    store.ingredients[idx] = {
      ...prev,
      name: body.name,
      unit: body.unit,
      supplierId: body.supplierId ?? null,
      unitPrice: body.unitPrice ?? null,
      stockQty: desiredStock,
      minStock: Math.max(0, body.minStock ?? prev.minStock ?? 0),
      updatedAt: nowIso(),
    };
    if (stockDelta !== 0) {
      logLocalMovement(store, id, stockDelta, "ajuste", { note: "Ajuste desde el catálogo" });
    }
    if (body.unitPrice != null && body.unitPrice !== prev.unitPrice) {
      store.ingredientPrices.push({
        id: nextId(store, "ingredientPrices"),
        ingredientId: id,
        unitPrice: body.unitPrice,
        recordedAt: nowIso(),
      });
    }
    write(store);
    return {
      ...withSupplierName(store, store.ingredients[idx]),
      priceHistory: store.ingredientPrices
        .filter((p) => p.ingredientId === id)
        .map((p) => ({ id: p.id, unitPrice: p.unitPrice, recordedAt: p.recordedAt })),
    };
  },
  async deleteIngredient(id: number) {
    const store = read();
    await assertCan(store, canDeleteCatalog);
    if (store.recipes.some((r) => r.ingredients.some((i) => i.ingredientId === id))) {
      fail("No se puede eliminar: el ingrediente está en uso en recetas o listas");
    }
    store.ingredients = store.ingredients.filter((i) => i.id !== id);
    write(store);
    return { ok: true };
  },

  listRecipes: () => read().recipes.slice().sort((a, b) => a.name.localeCompare(b.name, "es")),
  getRecipe(id: number) {
    return read().recipes.find((r) => r.id === id) ?? fail("Receta no encontrada");
  },
  async createRecipe(body: RecipeInput) {
    const store = read();
    await assertCan(store, canEditPrices);
    const id = nextId(store, "recipes");
    const ingredients = body.ingredients.map((ing, i) => {
      const cat = store.ingredients.find((x) => x.id === ing.ingredientId);
      return {
        id: i + 1,
        ingredientId: ing.ingredientId,
        quantity: ing.quantity,
        name: cat?.name ?? "—",
        unit: (cat?.unit ?? "unidad") as IngredientUnit,
      };
    });
    const packedCategory =
      body.category?.startsWith("svc:") === true
        ? null
        : body.category ?? null;
    const row: Recipe = {
      id,
      name: body.name,
      yieldPortions: body.yieldPortions,
      category: packedCategory,
      suitableServices: body.suitableServices ?? [],
      ingredients,
      instructions: body.instructions ?? null,
      estimatedCost: body.estimatedCost ?? null,
      imageUrl: body.imageUrl ?? null,
      allergenTags: parseDietaryTags(body.allergenTags),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.recipes.push(row);
    write(store);
    return row;
  },
  async updateRecipe(id: number, body: RecipeInput) {
    const store = read();
    await assertCan(store, canEditPrices);
    const idx = store.recipes.findIndex((r) => r.id === id);
    if (idx < 0) fail("Receta no encontrada");
    const ingredients = body.ingredients.map((ing, i) => {
      const cat = store.ingredients.find((x) => x.id === ing.ingredientId);
      return {
        id: i + 1,
        ingredientId: ing.ingredientId,
        quantity: ing.quantity,
        name: cat?.name ?? "—",
        unit: (cat?.unit ?? "unidad") as IngredientUnit,
      };
    });
    store.recipes[idx] = {
      ...store.recipes[idx],
      name: body.name,
      yieldPortions: body.yieldPortions,
      category: body.category?.startsWith("svc:") ? null : body.category ?? null,
      suitableServices: body.suitableServices ?? [],
      instructions: body.instructions ?? null,
      estimatedCost: body.estimatedCost ?? null,
      imageUrl: body.imageUrl ?? null,
      allergenTags: parseDietaryTags(body.allergenTags),
      ingredients,
      updatedAt: nowIso(),
    };
    write(store);
    return store.recipes[idx];
  },
  async deleteRecipe(id: number) {
    const store = read();
    await assertCan(store, canDeleteCatalog);
    if (store.events.some((e) => e.recipes.some((r) => r.recipeId === id))) {
      fail("No se puede eliminar: la receta está en uso en eventos");
    }
    store.recipes = store.recipes.filter((r) => r.id !== id);
    write(store);
    return { ok: true };
  },

  listEvents() {
    const store = read();
    return store.events
      .slice()
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
      .map((e) => eventSummary(store, e));
  },
  getEvent(id: number) {
    const store = read();
    const ev = store.events.find((e) => e.id === id);
    if (!ev) fail("Evento no encontrado");
    return eventDetail(store, ev);
  },
  createEvent(body: EventInput) {
    const store = read();
    if (!store.clients.some((c) => c.id === body.clientId)) fail("Debes elegir un cliente");
    const id = nextId(store, "events");
    const row = {
      id,
      clientId: body.clientId,
      title: body.title,
      eventDate: body.eventDate,
      location: body.location ?? null,
      attendees: body.attendees,
      status: body.status,
      dietaryRestrictions: body.dietaryRestrictions ?? null,
      ...eventOpsFromBody(body),
      notes: body.notes ?? null,
      estimatedCost: body.estimatedCost ?? null,
      services: body.services,
      recipes: body.recipes.map((r, i) => ({
        id: i + 1,
        recipeId: r.recipeId,
        serviceType: r.serviceType,
        portions: r.portions,
      })),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.events.push(row);
    write(store);
    return eventDetail(store, row);
  },
  updateEvent(id: number, body: EventInput) {
    const store = read();
    const idx = store.events.findIndex((e) => e.id === id);
    if (idx < 0) fail("Evento no encontrado");
    store.events[idx] = {
      ...store.events[idx],
      clientId: body.clientId,
      title: body.title,
      eventDate: body.eventDate,
      location: body.location ?? null,
      attendees: body.attendees,
      status: body.status,
      dietaryRestrictions: body.dietaryRestrictions ?? null,
      ...eventOpsFromBody(body),
      notes: body.notes ?? null,
      estimatedCost: body.estimatedCost ?? null,
      services: body.services,
      recipes: body.recipes.map((r, i) => ({
        id: i + 1,
        recipeId: r.recipeId,
        serviceType: r.serviceType,
        portions: r.portions,
      })),
      updatedAt: nowIso(),
    };
    write(store);
    return eventDetail(store, store.events[idx]);
  },
  deleteEvent(id: number) {
    const store = read();
    store.events = store.events.filter((e) => e.id !== id);
    store.quotes = store.quotes.filter((q) => q.eventId !== id);
    store.shoppingLists = store.shoppingLists.filter((l) => l.eventId !== id);
    store.purchaseOrders = store.purchaseOrders.map((order) =>
      order.eventId === id ? { ...order, eventId: null } : order,
    );
    store.stockMovements = store.stockMovements.map((movement) =>
      movement.eventId === id ? { ...movement, eventId: null } : movement,
    );
    write(store);
    return { ok: true };
  },

  getShoppingList(eventId: number, regenerate = false): ShoppingList {
    const store = read();
    const existing = store.shoppingLists.find((l) => l.eventId === eventId);
    if (existing && !regenerate) return existing;

    const ev = store.events.find((e) => e.id === eventId);
    if (!ev) fail("Evento no encontrado");

    const recipesForShopping = ev.recipes.map((er) => {
      const recipe = store.recipes.find((r) => r.id === er.recipeId);
      return {
        yieldPortions: recipe?.yieldPortions ?? 1,
        portions: er.portions,
        ingredients: (recipe?.ingredients ?? []).map((ing) => {
          const cat = store.ingredients.find((i) => i.id === ing.ingredientId);
          const supplier = cat?.supplierId
            ? store.suppliers.find((s) => s.id === cat.supplierId)
            : undefined;
          return {
            ingredientId: ing.ingredientId,
            name: cat?.name ?? ing.name,
            unit: cat?.unit ?? ing.unit,
            quantity: ing.quantity,
            supplierId: cat?.supplierId ?? null,
            supplierName: supplier?.name ?? null,
            unitPrice: cat?.unitPrice ?? null,
          };
        }),
      };
    });

    const lines = buildShoppingLines(recipesForShopping)
      .map((l) => {
        const cat = store.ingredients.find((i) => i.id === l.ingredientId);
        const needed = quantityAfterStock(
          l.quantity,
          l.unit,
          cat?.stockQty ?? 0,
          cat?.unit ?? l.unit,
        );
        return { ...l, quantity: needed };
      })
      .filter((l) => l.quantity > 0);

    const list: ShoppingList = {
      id: existing?.id ?? nextId(store, "shoppingLists"),
      eventId,
      status: "pendiente",
      generatedAt: nowIso(),
      items: lines.map((l, i) => ({
        id: i + 1,
        ingredientId: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        purchased: false,
        name: l.name,
        supplierId: l.supplierId,
        supplierName: l.supplierName,
        unitPrice: l.unitPrice,
      })),
    };

    store.shoppingLists = store.shoppingLists.filter((l) => l.eventId !== eventId);
    store.shoppingLists.push(list);
    write(store);
    return list;
  },

  async updateShoppingList(
    eventId: number,
    body: { items?: Array<{ id: number; purchased: boolean }>; status?: ShoppingListStatus },
  ) {
    const store = read();
    await assertCan(store, canEditPrices);
    const idx = store.shoppingLists.findIndex((l) => l.eventId === eventId);
    if (idx < 0) fail("No hay lista de compras. Genérala primero.");
    const list = store.shoppingLists[idx];
    if (body.items) {
      for (const patch of body.items) {
        const current = list.items.find((i) => i.id === patch.id);
        if (!current) continue;
        if (current.purchased !== patch.purchased) {
          const ing = store.ingredients.find((item) => item.id === current.ingredientId);
          if (ing) {
            const nextStock = applyPurchaseToStock(
              ing.stockQty ?? 0,
              ing.unit,
              current.quantity,
              current.unit,
              current.purchased,
              patch.purchased,
            );
            const delta = roundQty(nextStock - (ing.stockQty ?? 0));
            if (delta !== 0) {
              applyLocalDelta(store, ing.id, delta, delta > 0 ? "recepcion" : "ajuste", {
                note: delta > 0 ? "Marcado en la lista de compras" : "Desmarcado en la lista de compras",
                eventId,
              });
            }
          }
        }
        list.items = list.items.map((i) =>
          i.id === patch.id ? { ...i, purchased: patch.purchased } : i,
        );
      }
    }
    if (body.status) list.status = body.status;
    store.shoppingLists[idx] = list;
    write(store);
    return list;
  },

  listQuotes() {
    const store = read();
    return store.quotes
      .slice()
      .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate))
      .map((q) => quoteSummary(store, q));
  },
  getQuote(id: number) {
    const store = read();
    const q = store.quotes.find((x) => x.id === id);
    if (!q) fail("Cotización no encontrada");
    return quoteDetail(store, q);
  },
  async createQuote(body: QuoteInput) {
    const store = read();
    await assertCan(store, canEditQuotes);
    if (!store.events.some((e) => e.id === body.eventId)) {
      fail("Debes vincular la cotización a un evento");
    }
    const row = {
      id: nextId(store, "quotes"),
      eventId: body.eventId,
      quoteNumber: body.quoteNumber ?? null,
      quoteDate: body.quoteDate ?? nowIso(),
      items: body.items,
      total: quoteTotal(body.items),
      notes: body.notes ?? null,
      status: body.status,
      foodCost: Math.max(0, Math.round(Number(body.foodCost) || 0)),
      payments: [] as QuotePayment[],
      depositAmount: 0,
      version: 1,
      parentQuoteId: null,
      publicToken: randomToken().slice(0, 32),
      dueDate: body.dueDate ?? store.events.find((e) => e.id === body.eventId)?.eventDate ?? null,
      validUntil: resolveValidUntil(body.validUntil, new Date(body.quoteDate ?? Date.now())).toISOString(),
      lastContactedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    row.payments = paymentsForBody(store, body);
    row.depositAmount = sumPayments(row.payments);
    store.quotes.push(row);
    syncEventStatusFromQuote(store, body.eventId, body.status);
    write(store);
    return quoteDetail(store, row);
  },
  async updateQuote(id: number, body: QuoteInput) {
    const store = read();
    await assertCan(store, canEditQuotes);
    const idx = store.quotes.findIndex((q) => q.id === id);
    if (idx < 0) fail("Cotización no encontrada");
    store.quotes[idx] = {
      ...store.quotes[idx],
      eventId: body.eventId,
      quoteNumber: body.quoteNumber ?? null,
      quoteDate: body.quoteDate ?? store.quotes[idx].quoteDate,
      items: body.items,
      total: quoteTotal(body.items),
      notes: body.notes ?? null,
      status: body.status,
      foodCost: Math.max(0, Math.round(Number(body.foodCost) || 0)),
      payments: paymentsForBody(store, body),
      depositAmount: 0,
      dueDate: body.dueDate !== undefined ? body.dueDate : store.quotes[idx].dueDate,
      validUntil:
        body.validUntil !== undefined
          ? body.validUntil
            ? resolveValidUntil(body.validUntil, new Date(body.quoteDate ?? store.quotes[idx].quoteDate)).toISOString()
            : null
          : store.quotes[idx].validUntil,
      lastContactedAt:
        body.lastContactedAt !== undefined ? body.lastContactedAt : store.quotes[idx].lastContactedAt,
      updatedAt: nowIso(),
    };
    store.quotes[idx].depositAmount = sumPayments(store.quotes[idx].payments);
    syncEventStatusFromQuote(store, body.eventId, body.status);
    write(store);
    return quoteDetail(store, store.quotes[idx]);
  },
  async deleteQuote(id: number) {
    const store = read();
    await assertCan(store, canEditQuotes);
    store.quotes = store.quotes.filter((q) => q.id !== id);
    write(store);
    return { ok: true };
  },
  async duplicateQuote(id: number) {
    const store = read();
    await assertCan(store, canEditQuotes);
    const source = store.quotes.find((q) => q.id === id);
    if (!source) fail("Cotización no encontrada");
    const nextVersion =
      Math.max(0, ...store.quotes.filter((q) => q.eventId === source.eventId).map((q) => q.version ?? 1)) + 1;
    const row = {
      ...source,
      id: nextId(store, "quotes"),
      quoteNumber: source.quoteNumber ? `${source.quoteNumber}-v${nextVersion}` : null,
      quoteDate: nowIso(),
      status: "borrador" as const,
      payments: [] as QuotePayment[],
      depositAmount: 0,
      version: nextVersion,
      parentQuoteId: source.id,
      publicToken: randomToken().slice(0, 32),
      validUntil: resolveValidUntil(null, new Date()).toISOString(),
      lastContactedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.quotes.push(row);
    write(store);
    return quoteDetail(store, row);
  },
  getPublicQuote(token: string) {
    const store = read();
    const q = store.quotes.find((x) => x.publicToken === token.trim());
    if (!q) fail("Cotización no encontrada");
    const detail = quoteDetail(store, q);
    const history = store.quotes
      .filter((row) => row.eventId === q.eventId)
      .sort((a, b) => a.version - b.version)
      .map((row) => ({
        version: row.version,
        quoteDate: row.quoteDate,
        total: row.total,
        status: row.status,
      }));
    return {
      id: detail.id,
      quoteNumber: detail.quoteNumber,
      quoteDate: detail.quoteDate,
      items: detail.items,
      total: detail.total,
      notes: detail.notes,
      status: detail.status,
      version: detail.version,
      eventTitle: detail.eventTitle,
      eventDate: detail.eventDate,
      location: detail.location,
      attendees: detail.attendees,
      clientName: detail.clientName,
      clientCompany: detail.clientCompany,
      validUntil: detail.validUntil,
      superseded: isQuoteSuperseded(
        detail.version,
        history.map((item) => item.version),
      ),
      history,
    };
  },
  respondPublicQuote(token: string, action: "accept" | "reject") {
    const store = read();
    const idx = store.quotes.findIndex((x) => x.publicToken === token);
    if (idx < 0) fail("Cotización no encontrada");
    const current = store.quotes[idx];
    if (current.status === "aceptada" || current.status === "rechazada") {
      fail("Esta cotización ya fue respondida");
    }
    const versions = store.quotes.filter((row) => row.eventId === current.eventId).map((row) => row.version);
    if (isQuoteSuperseded(current.version, versions)) {
      fail("Esta versión fue reemplazada. Pide el enlace de la más nueva.");
    }
    if (!isQuoteOfferOpen(current.validUntil)) fail("Esta cotización ya no está vigente");
    const status = action === "accept" ? "aceptada" : "rechazada";
    store.quotes[idx] = { ...store.quotes[idx], status, updatedAt: nowIso() };
    if (status === "aceptada") syncEventStatusFromQuote(store, store.quotes[idx].eventId, status);
    write(store);
    return local.getPublicQuote(token);
  },
  async updateUserRole(id: number, role: TeamRole) {
    const store = read();
    const me = await assertCan(store, canManageUsers);
    if (me && me.id === id) fail("No puedes cambiar tu propio rol");
    const idx = store.teamUsers.findIndex((u) => u.id === id);
    if (idx < 0) fail("Usuario no encontrado");
    store.teamUsers[idx] = { ...store.teamUsers[idx], role: normalizeRole(role), updatedAt: nowIso() };
    write(store);
    return toPublicUser(store.teamUsers[idx]);
  },

  async authStatus() {
    const store = read();
    const configured = store.teamUsers.length > 0;
    const user = configured ? await localSessionUser(store) : null;
    const mine = user ? store.teamUsers.find((row) => row.id === user.id) : null;
    const hasRecovery = mine
      ? Boolean(mine.recoveryHash)
      : store.teamUsers.some((row) => row.recoveryHash);
    return {
      configured,
      user,
      hasRecovery,
      demoAvailable: localDemoEnabled() && !store.teamUsers.some((u) => u.email !== DEMO_USER_EMAIL),
    };
  },

  async authSetup(body: { name: string; email: string; password: string }) {
    const store = read();
    if (store.teamUsers.length > 0) fail("El acceso del equipo ya está creado");
    const name = body.name.trim();
    const email = normalizeEmail(body.email);
    if (!name) fail("El nombre es obligatorio");
    if (!email.includes("@")) fail("Indica un email válido");
    if (body.password.length < 8) fail("La contraseña debe tener al menos 8 caracteres");
    const hashed = await hashPassword(body.password);
    const row = {
      id: nextId(store, "teamUsers"),
      email,
      name,
      passwordSalt: hashed.salt,
      passwordHash: hashed.hash,
      role: "admin" as const,
      recoverySalt: null,
      recoveryHash: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.teamUsers.push(row);
    const token = await createLocalSession(store, row.id);
    const recoveryCode = await issueLocalRecovery(store, row.id);
    write(store);
    return { user: toPublicUser(row), token, recoveryCode };
  },

  async authLogin(body: { email: string; password: string }) {
    const store = read();
    const email = normalizeEmail(body.email);
    const row = store.teamUsers.find((u) => u.email === email);
    if (!row || !(await verifyPassword(body.password, row.passwordSalt, row.passwordHash))) {
      fail("Email o contraseña incorrectos");
    }
    const token = await createLocalSession(store, row.id);
    write(store);
    return { user: toPublicUser(row), token };
  },

  async authDemoLogin() {
    if (!localDemoEnabled()) fail("El acceso de prueba está desactivado");
    const store = read();
    if (store.teamUsers.some((u) => u.email !== DEMO_USER_EMAIL)) {
      fail("El acceso de prueba está desactivado");
    }
    let row = store.teamUsers.find((u) => u.email === DEMO_USER_EMAIL);
    if (!row) {
      const hashed = await hashPassword(randomToken());
      row = {
        id: nextId(store, "teamUsers"),
        email: DEMO_USER_EMAIL,
        name: DEMO_USER_NAME,
        passwordSalt: hashed.salt,
        passwordHash: hashed.hash,
        role: "admin" as const,
        recoverySalt: null,
        recoveryHash: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.teamUsers.push(row);
    }
    const token = await createLocalSession(store, row.id);
    write(store);
    return { user: toPublicUser(row), token };
  },

  async authLogout() {
    const store = read();
    const token = getSessionToken();
    if (token) {
      const tokenHash = await sha256Hex(token);
      store.teamSessions = store.teamSessions.filter((s) => s.tokenHash !== tokenHash);
      write(store);
    }
    return { ok: true };
  },

  authListUsers(): AuthUser[] {
    return read().teamUsers.map(toPublicUser);
  },

  async authAddUser(body: { name: string; email: string; password: string }) {
    const store = read();
    if (store.teamUsers.length > 0) await assertCan(store, canManageUsers);
    const name = body.name.trim();
    const email = normalizeEmail(body.email);
    if (!name) fail("El nombre es obligatorio");
    if (!email.includes("@")) fail("Indica un email válido");
    if (body.password.length < 8) fail("La contraseña debe tener al menos 8 caracteres");
    if (store.teamUsers.some((u) => u.email === email)) fail("Ese email ya tiene acceso");
    const hashed = await hashPassword(body.password);
    const row = {
      id: nextId(store, "teamUsers"),
      email,
      name,
      passwordSalt: hashed.salt,
      passwordHash: hashed.hash,
      role: "admin" as const,
      recoverySalt: null,
      recoveryHash: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.teamUsers.push(row);
    write(store);
    return { user: toPublicUser(row) };
  },

  async authChangePassword(body: { currentPassword: string; password: string }) {
    const store = read();
    const user = await localSessionUser(store);
    if (!user) fail("Inicia sesión para continuar");
    if (body.password.length < 8) fail("La contraseña debe tener al menos 8 caracteres");
    const row = store.teamUsers.find((u) => u.id === user.id);
    if (!row) fail("Usuario no encontrado");
    if (!(await verifyPassword(body.currentPassword, row.passwordSalt, row.passwordHash))) {
      fail("La contraseña actual no es correcta");
    }
    const hashed = await hashPassword(body.password);
    row.passwordSalt = hashed.salt;
    row.passwordHash = hashed.hash;
    row.updatedAt = nowIso();
    store.teamSessions = store.teamSessions.filter((s) => s.userId !== user.id);
    const token = await createLocalSession(store, user.id);
    write(store);
    return { ok: true, token };
  },

  async authDeleteUser(id: number) {
    const store = read();
    const me = await assertCan(store, canManageUsers);
    if (!me) fail("Inicia sesión para continuar");
    if (id === me.id) fail("No puedes quitarte a ti mismo");
    if (store.teamUsers.length <= 1) fail("Debe quedar al menos una persona con acceso");
    if (!store.teamUsers.some((u) => u.id === id)) fail("Usuario no encontrado");
    store.teamUsers = store.teamUsers.filter((u) => u.id !== id);
    store.teamSessions = store.teamSessions.filter((s) => s.userId !== id);
    write(store);
    return { ok: true };
  },

  async authResetUserPassword(body: { userId: number; password: string }) {
    const store = read();
    const me = await assertCan(store, canManageUsers);
    if (!me) fail("Inicia sesión para continuar");
    if (body.userId === me.id) fail("Para tu contraseña usa Cambiar mi contraseña");
    if (body.password.length < 8) fail("La contraseña debe tener al menos 8 caracteres");
    const row = store.teamUsers.find((u) => u.id === body.userId);
    if (!row) fail("Usuario no encontrado");
    const hashed = await hashPassword(body.password);
    row.passwordSalt = hashed.salt;
    row.passwordHash = hashed.hash;
    row.updatedAt = nowIso();
    store.teamSessions = store.teamSessions.filter((s) => s.userId !== row.id);
    write(store);
    return { ok: true };
  },

  async authIssueRecoveryCode() {
    const store = read();
    const me = await localSessionUser(store);
    if (store.teamUsers.length > 0 && !me) fail("Inicia sesión para continuar");
    if (!me) fail("Inicia sesión para continuar");
    const recoveryCode = await issueLocalRecovery(store, me.id);
    write(store);
    return { recoveryCode };
  },

  async authRecover(body: { email: string; code: string; password: string }) {
    const store = read();
    const email = normalizeEmail(body.email);
    const row = store.teamUsers.find((u) => u.email === email);
    const codeOk =
      row?.recoverySalt &&
      row.recoveryHash &&
      (await verifyPassword(normalizeRecoveryCode(body.code), row.recoverySalt, row.recoveryHash));
    if (!row || !codeOk) fail("Email o código incorrectos");
    if (body.password.length < 8) fail("La contraseña debe tener al menos 8 caracteres");
    const hashed = await hashPassword(body.password);
    row.passwordSalt = hashed.salt;
    row.passwordHash = hashed.hash;
    row.updatedAt = nowIso();
    store.teamSessions = store.teamSessions.filter((s) => s.userId !== row.id);
    const token = await createLocalSession(store, row.id);
    write(store);
    return { user: toPublicUser(row), token };
  },

  listStockMovements(ingredientId?: number): StockMovement[] {
    const store = read();
    return store.stockMovements
      .filter((row) => (ingredientId ? row.ingredientId === ingredientId : true))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map((row) => toStockMovement(store, row));
  },

  createStockMovement(body: {
    ingredientId: number;
    kind: StockMovementKind;
    qty: number;
    note?: string | null;
    eventId?: number | null;
  }): StockMovement {
    if (!isStockMovementKind(body.kind)) fail("Tipo de movimiento no válido");
    const delta = movementDelta(body.kind, body.qty);
    if (delta === 0) fail("La cantidad debe ser distinta de cero");
    const store = read();
    const applied = applyLocalDelta(store, body.ingredientId, delta, body.kind, {
      note: body.note?.trim() || null,
      eventId: body.eventId ?? null,
    });
    if (applied === 0) fail("El stock no cambió. Revisa la cantidad.");
    write(store);
    const row = store.stockMovements[store.stockMovements.length - 1];
    return toStockMovement(store, row);
  },

  listPurchaseOrders(eventId?: number): PurchaseOrder[] {
    const store = read();
    return store.purchaseOrders
      .filter((order) => (eventId ? order.eventId === eventId : true))
      .slice()
      .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
      .map((order) => toPurchaseOrder(store, order));
  },

  async createPurchaseOrders(eventId: number): Promise<PurchaseOrder[]> {
    const store = read();
    await assertCan(store, canEditPrices);
    if (store.purchaseOrders.some((order) => order.eventId === eventId && isOpenPurchaseStatus(order.status))) {
      fail("Ya hay una orden abierta para este evento. Recíbela o cancélala antes de crear otra.");
    }
    const list = store.shoppingLists.find((item) => item.eventId === eventId);
    if (!list) fail("No hay lista de compras. Genérala primero.");
    const groups = pendingOrderGroups(
      list.items.map((item) => {
        const ing = store.ingredients.find((row) => row.id === item.ingredientId);
        return {
          ingredientId: item.ingredientId,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: ing?.unitPrice ?? item.unitPrice,
          supplierId: ing?.supplierId ?? item.supplierId,
          purchased: item.purchased,
          catalogUnit: ing?.unit ?? item.unit,
        };
      }),
    );
    if (!groups.length) fail("No hay ítems pendientes para ordenar.");
    const created: Store["purchaseOrders"] = [];
    for (const group of groups) {
      const order: Store["purchaseOrders"][number] = {
        id: nextId(store, "purchaseOrders"),
        supplierId: group.supplierId,
        eventId,
        status: "enviada",
        invoiceNumber: null,
        invoiceTotal: null,
        notes: null,
        orderedAt: nowIso(),
        receivedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        items: group.lines.map((line) => ({
          id: nextId(store, "purchaseOrderItems"),
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          receivedQty: 0,
        })),
      };
      store.purchaseOrders.push(order);
      created.push(order);
    }
    write(store);
    return created.map((order) => toPurchaseOrder(store, order));
  },

  async receivePurchaseOrder(
    id: number,
    body: {
      invoiceNumber?: string | null;
      invoiceTotal?: number | null;
      items: Array<{ id: number; receivedQty: number }>;
    },
  ): Promise<PurchaseOrder> {
    const store = read();
    await assertCan(store, canEditPrices);
    const order = store.purchaseOrders.find((row) => row.id === id);
    if (!order) fail("Orden no encontrada");
    if (order.status === "cancelada") fail("La orden está cancelada");
    const requested = new Map(body.items.map((item) => [item.id, item.receivedQty]));
    const list = order.eventId ? store.shoppingLists.find((item) => item.eventId === order.eventId) : undefined;
    let receivedSomething = false;
    for (const item of order.items) {
      const target = requested.has(item.id) ? (requested.get(item.id) as number) : item.quantity;
      if (target + 1e-9 < item.receivedQty) fail("No se puede recibir menos de lo ya ingresado");
      const add = roundQty(target - item.receivedQty);
      if (!(add > 0)) continue;
      const line = list?.items.find((row) => row.ingredientId === item.ingredientId);
      const skipStock = Boolean(line?.purchased) && item.receivedQty === 0;
      if (!skipStock) {
        const ing = store.ingredients.find((row) => row.id === item.ingredientId);
        if (!ing) fail("Ingrediente no encontrado");
        const delta = convertQuantity(add, item.unit, ing.unit);
        if (delta == null) fail(`No se puede sumar ${ing.name}: la unidad de la orden no coincide con el catálogo`);
        applyLocalDelta(store, ing.id, delta, "recepcion", {
          note: `Recepción orden #${id}`,
          eventId: order.eventId,
          purchaseOrderId: id,
        });
      }
      item.receivedQty = roundQty(item.receivedQty + add);
      if (list) {
        list.items = list.items.map((row) =>
          row.ingredientId === item.ingredientId ? { ...row, purchased: true } : row,
        );
      }
      receivedSomething = true;
    }
    if (!receivedSomething) fail("Indica cuánto recibiste");
    const complete = order.items.every((item) => item.receivedQty + 1e-9 >= item.quantity);
    order.status = complete ? "recibida" : "enviada";
    order.receivedAt = complete ? nowIso() : order.receivedAt;
    if (body.invoiceNumber != null && String(body.invoiceNumber).trim() !== "") {
      order.invoiceNumber = String(body.invoiceNumber).trim();
    }
    if (body.invoiceTotal != null && body.invoiceTotal !== ("" as unknown)) {
      const total = Number(body.invoiceTotal);
      if (Number.isFinite(total)) order.invoiceTotal = total;
    }
    order.updatedAt = nowIso();
    write(store);
    return toPurchaseOrder(store, order);
  },

  async cancelPurchaseOrder(id: number): Promise<PurchaseOrder> {
    const store = read();
    await assertCan(store, canEditPrices);
    const order = store.purchaseOrders.find((row) => row.id === id);
    if (!order) fail("Orden no encontrada");
    if (order.items.some((item) => item.receivedQty > 0)) {
      fail("Ya hay cantidades recibidas. No se puede cancelar.");
    }
    order.status = "cancelada";
    order.updatedAt = nowIso();
    write(store);
    return toPurchaseOrder(store, order);
  },
};
