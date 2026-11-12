import { LOCAL_STORE_KEY } from "./localStore";
import { SETTINGS_KEY } from "./settings";

export const BACKUP_FORMAT = "cateringcrm-backup";
export const BACKUP_VERSION = 1;

const EXPORTED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const SPECS = [
  { key: "clients", label: "Clientes", kind: "array" },
  { key: "suppliers", label: "Proveedores", kind: "array" },
  { key: "ingredients", label: "Ingredientes", kind: "array" },
  { key: "recipes", label: "Recetas", kind: "array" },
  { key: "events", label: "Eventos", kind: "array" },
  { key: "quotes", label: "Cotizaciones", kind: "array" },
  { key: "shoppingLists", label: "Listas de compras", kind: "array" },
  { key: "teamUsers", label: "Equipo", kind: "array" },
  { key: "teamSessions", label: "Sesiones", kind: "array" },
  { key: "teamRecovery", label: "Recuperación", kind: "nullable" },
  { key: "ingredientPrices", label: "Precios", kind: "array" },
  { key: "stockMovements", label: "Movimientos de stock", kind: "array" },
  { key: "purchaseOrders", label: "Órdenes de compra", kind: "array" },
  { key: "seq", label: "Contadores", kind: "record" },
  { key: "companySettings", label: "Datos de empresa", kind: "nullable" },
] as const;

type SpecKey = (typeof SPECS)[number]["key"];

export const BACKUP_COLLECTION_KEYS = SPECS.map((spec) => spec.key);

export type BackupCollections = {
  clients: unknown[];
  suppliers: unknown[];
  ingredients: unknown[];
  recipes: unknown[];
  events: unknown[];
  quotes: unknown[];
  shoppingLists: unknown[];
  teamUsers: unknown[];
  teamSessions: unknown[];
  teamRecovery: Record<string, unknown> | null;
  ingredientPrices: unknown[];
  stockMovements: unknown[];
  purchaseOrders: unknown[];
  seq: Record<string, number>;
  companySettings: Record<string, unknown> | null;
};

export type LocalBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  collections: BackupCollections;
};

export type BackupValidation =
  | { ok: true; backup: LocalBackup }
  | { ok: false; error: string };

export type BackupStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type CollectionCount = {
  key: SpecKey;
  label: string;
  count: number;
};

const STORE_KEYS = new Set<string>(
  SPECS.filter((spec) => spec.key !== "companySettings").map((spec) => spec.key),
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function copyRecord(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) out[key] = value[key];
  return out;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value.slice() : null;
}

function asNullable(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) return null;
  if (!isPlainObject(value)) return undefined;
  return copyRecord(value);
}

function asSeq(value: unknown): Record<string, number> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, number> = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    out[key] = item;
  }
  return out;
}

function emptyCollections(): BackupCollections {
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
    companySettings: null,
  };
}

function assignCollection(
  target: BackupCollections,
  key: SpecKey,
  value: unknown,
): string | null {
  const spec = SPECS.find((item) => item.key === key);
  if (!spec) return "El respaldo no es válido.";
  if (spec.kind === "array") {
    const list = asArray(value);
    if (!list) return `«${spec.label}» no es una lista.`;
    target[key] = list as never;
    return null;
  }
  if (spec.kind === "record") {
    const seq = asSeq(value);
    if (!seq) return `«${spec.label}» no es válido.`;
    target.seq = seq;
    return null;
  }
  const nullable = asNullable(value);
  if (nullable === undefined) return `«${spec.label}» no es válido.`;
  if (key === "teamRecovery") target.teamRecovery = nullable;
  if (key === "companySettings") target.companySettings = nullable;
  return null;
}

function parseFileCollections(value: unknown): { ok: true; collections: BackupCollections } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: "El respaldo no incluye las colecciones." };
  for (const key of Object.keys(value)) {
    if (!BACKUP_COLLECTION_KEYS.includes(key as SpecKey)) {
      return { ok: false, error: `«${key}» no es una colección de este respaldo.` };
    }
  }
  const collections = emptyCollections();
  for (const spec of SPECS) {
    if (!(spec.key in value)) return { ok: false, error: `Falta «${spec.label}».` };
    const error = assignCollection(collections, spec.key, value[spec.key]);
    if (error) return { ok: false, error };
  }
  return { ok: true, collections };
}

export function validateBackup(json: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "El archivo no es JSON válido." };
  }
  if (!isPlainObject(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, error: "El archivo no es un respaldo válido." };
  }
  if (parsed.version !== BACKUP_VERSION) {
    return { ok: false, error: "La versión del respaldo no es compatible." };
  }
  if (typeof parsed.exportedAt !== "string" || !EXPORTED_AT.test(parsed.exportedAt)) {
    return { ok: false, error: "El respaldo no tiene una fecha válida." };
  }
  const collections = parseFileCollections(parsed.collections);
  if (!collections.ok) return collections;
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: parsed.exportedAt,
      collections: collections.collections,
    },
  };
}

export function serializeBackup(collections: BackupCollections, exportedAt: string): string {
  const file = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    collections,
  };
  const check = validateBackup(JSON.stringify(file));
  if (!check.ok) throw new Error(check.error);
  return JSON.stringify(check.backup, null, 2);
}

function readRaw(storage: BackupStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    throw new Error("No se pudo leer el almacenamiento local.");
  }
}

function readSettings(storage: BackupStorage): Record<string, unknown> | null {
  const raw = readRaw(storage, SETTINGS_KEY);
  if (raw == null || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("No se pudo leer «Datos de empresa».");
  }
  if (parsed === null) return null;
  const settings = asNullable(parsed);
  if (settings === undefined) throw new Error("No se pudo leer «Datos de empresa».");
  return settings;
}

function readStoreCollections(storage: BackupStorage): BackupCollections {
  const collections = emptyCollections();
  const raw = readRaw(storage, LOCAL_STORE_KEY);
  if (raw == null || raw.trim() === "") return collections;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("No se pudo leer el almacenamiento local.");
  }
  if (!isPlainObject(parsed)) throw new Error("No se pudo leer el almacenamiento local.");
  for (const key of Object.keys(parsed)) {
    if (!STORE_KEYS.has(key)) throw new Error("Hay datos locales que esta versión no reconoce.");
  }
  for (const spec of SPECS) {
    if (spec.key === "companySettings" || !(spec.key in parsed)) continue;
    const error = assignCollection(collections, spec.key, parsed[spec.key]);
    if (error) throw new Error(`No se pudo leer «${spec.label}».`);
  }
  return collections;
}

export function readBackupCollections(storage: BackupStorage): BackupCollections {
  const collections = readStoreCollections(storage);
  collections.companySettings = readSettings(storage);
  return collections;
}

function writeRaw(storage: BackupStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    throw new Error("No se pudo guardar el respaldo.");
  }
}

function writeCollections(collections: BackupCollections, storage: BackupStorage): void {
  const store = {
    clients: collections.clients,
    suppliers: collections.suppliers,
    ingredients: collections.ingredients,
    recipes: collections.recipes,
    events: collections.events,
    quotes: collections.quotes,
    shoppingLists: collections.shoppingLists,
    teamUsers: collections.teamUsers,
    teamSessions: collections.teamSessions,
    teamRecovery: collections.teamRecovery,
    ingredientPrices: collections.ingredientPrices,
    stockMovements: collections.stockMovements,
    purchaseOrders: collections.purchaseOrders,
    seq: collections.seq,
  };
  writeRaw(storage, LOCAL_STORE_KEY, JSON.stringify(store));
  if (collections.companySettings == null) {
    try {
      storage.removeItem(SETTINGS_KEY);
    } catch {
      throw new Error("No se pudo guardar el respaldo.");
    }
    return;
  }
  writeRaw(storage, SETTINGS_KEY, JSON.stringify(collections.companySettings));
}

export function restoreBackupJson(
  json: string,
  storage: BackupStorage,
): { ok: true } | { ok: false; error: string } {
  const result = validateBackup(json);
  if (!result.ok) return result;
  writeCollections(result.backup.collections, storage);
  return { ok: true };
}

export function collectionCounts(collections: BackupCollections): CollectionCount[] {
  return SPECS.map((spec) => {
    const value = collections[spec.key];
    const count = Array.isArray(value)
      ? value.length
      : value == null
        ? 0
        : spec.kind === "record"
          ? Object.keys(value).length
          : 1;
    return { key: spec.key, label: spec.label, count };
  });
}

export function describeRestore(
  current: BackupCollections | null,
  incoming: BackupCollections,
  when: string,
): string {
  if (!current) {
    return `No se pudieron leer los datos actuales. ¿Reemplazarlos con el respaldo del ${when}? Esta acción no se puede deshacer.`;
  }
  const quiet = new Set<SpecKey>(["teamSessions", "teamRecovery", "seq"]);
  const incomingCounts = new Map(collectionCounts(incoming).map((row) => [row.key, row.count]));
  const changes = collectionCounts(current)
    .filter((row) => !quiet.has(row.key) && row.count !== incomingCounts.get(row.key))
    .map((row) => `${row.label} de ${row.count} a ${incomingCounts.get(row.key)}.`);
  const detail = changes.length ? ` ${changes.join(" ")}` : "";
  return `¿Reemplazar todos los datos de este dispositivo con el respaldo del ${when}?${detail} Esta acción no se puede deshacer.`;
}
