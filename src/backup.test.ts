import { describe, expect, it } from "vitest";
import {
  BACKUP_COLLECTION_KEYS,
  describeRestore,
  readBackupCollections,
  restoreBackupJson,
  serializeBackup,
  validateBackup,
  type BackupCollections,
  type BackupStorage,
} from "./backup";
import { LOCAL_STORE_KEY } from "./localStore";
import { TOKEN_KEY } from "./session";
import { SETTINGS_KEY } from "./settings";
import { RUNTIME_KEY } from "./supabase";

/** Datos de prueba. No son registros reales del CRM. */
const EXPORTED_AT = "2026-01-15T12:00:00.000Z";

function fixtureCollections(): BackupCollections {
  return {
    clients: [{ id: 1, name: "Cliente de prueba" }],
    suppliers: [],
    ingredients: [{ id: 1, name: "Ingrediente de prueba" }],
    recipes: [],
    events: [{ id: 1, title: "Evento de prueba" }],
    quotes: [],
    shoppingLists: [],
    teamUsers: [{ id: 1, email: "prueba@example.test", name: "Usuario de prueba" }],
    teamSessions: [],
    teamRecovery: null,
    ingredientPrices: [],
    stockMovements: [],
    purchaseOrders: [],
    seq: { clients: 1 },
    companySettings: { companyName: "Empresa de prueba" },
  };
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

class MemoryStorage implements BackupStorage {
  items = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.items.has(key) ? (this.items.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.writes += 1;
    this.items.delete(key);
  }
}

function seedDevice(storage: MemoryStorage, collections: BackupCollections): void {
  const { companySettings, ...store } = collections;
  storage.setItem(LOCAL_STORE_KEY, JSON.stringify(store));
  if (companySettings) storage.setItem(SETTINGS_KEY, JSON.stringify(companySettings));
  storage.writes = 0;
}

describe("serializeBackup", () => {
  it("incluye versión, fecha y todas las colecciones", () => {
    const json = serializeBackup(fixtureCollections(), EXPORTED_AT);
    const parsed = JSON.parse(json) as {
      format: string;
      version: number;
      exportedAt: string;
      collections: Record<string, unknown>;
    };

    expect(parsed.format).toBe("cateringcrm-backup");
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe(EXPORTED_AT);
    expect(Object.keys(parsed.collections).sort()).toEqual([...BACKUP_COLLECTION_KEYS].sort());
    expect(parsed.collections.clients).toEqual([{ id: 1, name: "Cliente de prueba" }]);
    expect(json).not.toContain("token-de-prueba");
    expect(json).not.toContain("clave-de-prueba");
  });
});

describe("validateBackup", () => {
  it("acepta un respaldo serializado y no escribe almacenamiento", () => {
    const storage = new MemoryStorage();
    seedDevice(storage, fixtureCollections());
    storage.setItem(TOKEN_KEY, "token-de-prueba");
    storage.setItem(RUNTIME_KEY, JSON.stringify({ url: "https://example.test", anonKey: "clave-de-prueba" }));
    storage.writes = 0;

    const json = serializeBackup(readBackupCollections(storage), EXPORTED_AT);
    expect(storage.writes).toBe(0);
    expect(json).not.toContain("token-de-prueba");
    expect(json).not.toContain("clave-de-prueba");

    const result = validateBackup(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.collections.clients).toEqual([{ id: 1, name: "Cliente de prueba" }]);
    expect(result.backup.collections.companySettings).toEqual({ companyName: "Empresa de prueba" });
    expect(storage.writes).toBe(0);
  });

  it("rechaza JSON, formato, versión y colecciones inválidas", () => {
    expect(validateBackup("{")).toEqual({ ok: false, error: "El archivo no es JSON válido." });
    expect(validateBackup("null")).toEqual({ ok: false, error: "El archivo no es un respaldo válido." });
    expect(validateBackup(JSON.stringify({ format: "otro", version: 1, exportedAt: EXPORTED_AT, collections: {} }))).toEqual({
      ok: false,
      error: "El archivo no es un respaldo válido.",
    });

    const base = JSON.parse(serializeBackup(emptyCollections(), EXPORTED_AT)) as Record<string, unknown>;
    expect(validateBackup(JSON.stringify({ ...base, version: 2 }))).toEqual({
      ok: false,
      error: "La versión del respaldo no es compatible.",
    });
    expect(validateBackup(JSON.stringify({ ...base, version: "1" }))).toEqual({
      ok: false,
      error: "La versión del respaldo no es compatible.",
    });
    expect(validateBackup(JSON.stringify({ ...base, exportedAt: "ayer" }))).toEqual({
      ok: false,
      error: "El respaldo no tiene una fecha válida.",
    });

    const collections = { ...(base.collections as Record<string, unknown>) };
    delete collections.clients;
    expect(validateBackup(JSON.stringify({ ...base, collections }))).toEqual({
      ok: false,
      error: "Falta «Clientes».",
    });
    expect(
      validateBackup(JSON.stringify({ ...base, collections: { ...(base.collections as object), clients: {} } })),
    ).toEqual({ ok: false, error: "«Clientes» no es una lista." });
    expect(
      validateBackup(
        JSON.stringify({ ...base, collections: { ...(base.collections as object), notas: [] } }),
      ),
    ).toEqual({ ok: false, error: "«notas» no es una colección de este respaldo." });
    expect(
      validateBackup(
        JSON.stringify({ ...base, collections: { ...(base.collections as object), seq: { clients: "1" } } }),
      ),
    ).toEqual({ ok: false, error: "«Contadores» no es válido." });
    expect(
      validateBackup(
        JSON.stringify({ ...base, collections: { ...(base.collections as object), teamRecovery: [] } }),
      ),
    ).toEqual({ ok: false, error: "«Recuperación» no es válido." });
  });
});

describe("restoreBackupJson", () => {
  it("restaura colecciones y deja intactas la sesión y la clave de Supabase", () => {
    const storage = new MemoryStorage();
    seedDevice(storage, emptyCollections());
    storage.setItem(TOKEN_KEY, "token-de-prueba");
    storage.setItem(RUNTIME_KEY, JSON.stringify({ anonKey: "clave-de-prueba" }));
    storage.writes = 0;

    const json = serializeBackup(fixtureCollections(), EXPORTED_AT);
    const result = restoreBackupJson(json, storage);
    expect(result).toEqual({ ok: true });

    const restored = readBackupCollections(storage);
    expect(restored).toEqual(fixtureCollections());
    const store = JSON.parse(storage.getItem(LOCAL_STORE_KEY) as string) as Record<string, unknown>;
    expect(store.companySettings).toBeUndefined();
    expect(storage.getItem(TOKEN_KEY)).toBe("token-de-prueba");
    expect(storage.getItem(RUNTIME_KEY)).toContain("clave-de-prueba");
  });

  it("borra los datos de empresa si el respaldo no los trae", () => {
    const storage = new MemoryStorage();
    seedDevice(storage, fixtureCollections());
    const json = serializeBackup(emptyCollections(), EXPORTED_AT);
    expect(restoreBackupJson(json, storage)).toEqual({ ok: true });
    expect(storage.getItem(SETTINGS_KEY)).toBeNull();
    expect(readBackupCollections(storage).clients).toEqual([]);
  });

  it("no toca los datos si el archivo no es válido", () => {
    const storage = new MemoryStorage();
    seedDevice(storage, fixtureCollections());
    storage.setItem(TOKEN_KEY, "token-de-prueba");
    const before = storage.getItem(LOCAL_STORE_KEY);

    for (const bad of ["{", "null", JSON.stringify({ format: "cateringcrm-backup", version: 2 })]) {
      const writes = storage.writes;
      const result = restoreBackupJson(bad, storage);
      expect(result.ok).toBe(false);
      expect(storage.writes).toBe(writes);
      expect(storage.getItem(LOCAL_STORE_KEY)).toBe(before);
      expect(storage.getItem(TOKEN_KEY)).toBe("token-de-prueba");
      expect(readBackupCollections(storage).clients).toEqual([{ id: 1, name: "Cliente de prueba" }]);
    }
  });

  it("describe el reemplazo sin escribir", () => {
    const storage = new MemoryStorage();
    const text = describeRestore(emptyCollections(), fixtureCollections(), "15 ene 2026");
    expect(text).toContain("15 ene 2026");
    expect(text).toContain("Clientes de 0 a 1.");
    expect(text).toContain("Esta acción no se puede deshacer.");
    expect(text).not.toContain("Contadores");
    expect(text).not.toContain("Sesiones");
    expect(storage.writes).toBe(0);
    expect(
      describeRestore(null, fixtureCollections(), "15 ene 2026"),
    ).toContain("No se pudieron leer los datos actuales.");
  });
});
