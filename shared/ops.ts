export const DIETARY_TAGS = [
  "gluten",
  "lactosa",
  "mani",
  "mariscos",
  "huevo",
  "soja",
  "vegano",
  "vegetariano",
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  gluten: "Sin gluten / celíaco",
  lactosa: "Sin lactosa",
  mani: "Sin maní / frutos secos",
  mariscos: "Sin mariscos",
  huevo: "Sin huevo",
  soja: "Sin soja",
  vegano: "Vegano",
  vegetariano: "Vegetariano",
};

export function isDietaryTag(value: unknown): value is DietaryTag {
  return typeof value === "string" && (DIETARY_TAGS as readonly string[]).includes(value);
}

export function parseDietaryTags(value: unknown): DietaryTag[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isDietaryTag))];
}

export type PackingItem = {
  id: number;
  label: string;
  quantity: number;
  packed: boolean;
};

export const DEFAULT_PACKING_LABELS = [
  "Vajilla / cubiertos",
  "Manteles / servilletas",
  "Bandejas de servicio",
  "Hielo",
  "Extensión eléctrica",
  "Contenedores / cooler",
];

export function defaultPackingItems(): PackingItem[] {
  return DEFAULT_PACKING_LABELS.map((label, i) => ({
    id: i + 1,
    label,
    quantity: 1,
    packed: false,
  }));
}

export function parsePackingItems(value: unknown): PackingItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, i) => {
      const item = raw as Record<string, unknown>;
      const label = String(item.label ?? "").trim();
      if (!label) return null;
      const id = Number(item.id);
      return {
        id: Number.isInteger(id) && id > 0 ? id : i + 1,
        label,
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        packed: Boolean(item.packed),
      };
    })
    .filter((row): row is PackingItem => row !== null);
}

export const EXPENSE_CATEGORIES = ["transporte", "personal", "arriendo", "extra", "otro"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  transporte: "Transporte",
  personal: "Personal extra",
  arriendo: "Arriendo / recinto",
  extra: "Extra",
  otro: "Otro",
};

export type EventExpense = {
  id: number;
  description: string;
  amount: number;
  category: ExpenseCategory;
};

export function parseExpenses(value: unknown): EventExpense[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, i) => {
      const item = raw as Record<string, unknown>;
      const description = String(item.description ?? "").trim();
      const amount = Math.max(0, Math.round(Number(item.amount) || 0));
      if (!description || amount <= 0) return null;
      const category = EXPENSE_CATEGORIES.includes(item.category as ExpenseCategory)
        ? (item.category as ExpenseCategory)
        : "otro";
      const id = Number(item.id);
      return {
        id: Number.isInteger(id) && id > 0 ? id : i + 1,
        description,
        amount,
        category,
      };
    })
    .filter((row): row is EventExpense => row !== null);
}

export function sumExpenses(items: EventExpense[]): number {
  return items.reduce((sum, row) => sum + row.amount, 0);
}

export const STAFF_ROLES = ["cocina", "servicio", "montaje", "otro"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  cocina: "Cocina",
  servicio: "Servicio",
  montaje: "Montaje",
  otro: "Otro",
};

export type EventStaff = {
  id: number;
  name: string;
  role: StaffRole;
  notes: string | null;
};

export function parseStaff(value: unknown): EventStaff[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, i) => {
      const item = raw as Record<string, unknown>;
      const name = String(item.name ?? "").trim();
      if (!name) return null;
      const role = STAFF_ROLES.includes(item.role as StaffRole) ? (item.role as StaffRole) : "otro";
      const id = Number(item.id);
      const notes = String(item.notes ?? "").trim();
      return {
        id: Number.isInteger(id) && id > 0 ? id : i + 1,
        name,
        role,
        notes: notes || null,
      };
    })
    .filter((row): row is EventStaff => row !== null);
}

export function parseTimeHm(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{1,2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function recipeConflicts(recipeTags: DietaryTag[], eventTags: DietaryTag[]): DietaryTag[] {
  const veganBlock = new Set<DietaryTag>(["huevo", "lactosa", "mariscos"]);
  return eventTags.filter((tag) => {
    if (tag === "vegano") return recipeTags.some((t) => veganBlock.has(t));
    if (tag === "vegetariano") return recipeTags.includes("mariscos");
    return recipeTags.includes(tag);
  });
}
