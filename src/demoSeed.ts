import type {
  ClientInput,
  EventInput,
  IngredientInput,
  RecipeInput,
  SupplierInput,
} from "../shared/types";

const DEMO_FLAG = "catering-crm:demo-seeded";

export function wasDemoSeeded(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}

export function markDemoSeeded(value: boolean): void {
  try {
    if (value) localStorage.setItem(DEMO_FLAG, "1");
    else localStorage.removeItem(DEMO_FLAG);
  } catch {
    /* ignore */
  }
}

/** Fechas relativas al “ahora” del usuario (evento en ~10 días). */
export function buildDemoPayload() {
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 10);
  eventDate.setHours(13, 0, 0, 0);

  const clients: ClientInput[] = [
    {
      name: "María González",
      phone: "+56 9 8765 4321",
      email: "maria@empresa.cl",
      company: "Empresa Andina SpA",
      notes: "Prefiere menú vegetariano opcional",
    },
    {
      name: "Carlos Ruiz",
      phone: "+56 9 1234 5678",
      email: "carlos@familia.cl",
      company: null,
      notes: "Cumpleaños familiar",
    },
  ];

  const suppliers: SupplierInput[] = [
    {
      name: "Mercado Central",
      contactName: "Ana Pérez",
      phone: "+56 2 2345 6789",
      email: "pedidos@mercadocentral.cl",
      notes: "Entrega martes y viernes",
    },
    {
      name: "Verduras del Valle",
      contactName: "Luis Soto",
      phone: "+56 9 5555 1111",
      email: null,
      notes: "Productos de temporada",
    },
  ];

  const ingredients: Array<IngredientInput & { _key: string }> = [
    { _key: "pollo", name: "Pechuga de pollo", unit: "kg", unitPrice: 6500 },
    { _key: "arroz", name: "Arroz", unit: "kg", unitPrice: 1800 },
    { _key: "limon", name: "Limón", unit: "unidad", unitPrice: 200 },
    { _key: "lechuga", name: "Lechuga", unit: "unidad", unitPrice: 900 },
    { _key: "tomate", name: "Tomate", unit: "kg", unitPrice: 2200 },
    { _key: "aceite", name: "Aceite de oliva", unit: "ml", unitPrice: 12 },
    { _key: "pan", name: "Pan amasado", unit: "unidad", unitPrice: 500 },
    { _key: "queso", name: "Queso fresco", unit: "g", unitPrice: 8 },
  ];

  const recipes: Array<RecipeInput & { _key: string; _ings: string[] }> = [
    {
      _key: "pollo",
      name: "Pollo al limón",
      yieldPortions: 10,
      category: "Plato principal",
      suitableServices: ["almuerzo", "cena"],
      instructions: "Sellar el pollo, agregar limón y hornear 25 min a 180°C.",
      estimatedCost: 45000,
      ingredients: [],
      _ings: ["pollo", "limon", "aceite", "arroz"],
    },
    {
      _key: "ensalada",
      name: "Ensalada mixta",
      yieldPortions: 10,
      category: "Entrada",
      suitableServices: ["almuerzo", "cena", "desayuno"],
      instructions: "Lavar, cortar y aliñar al momento de servir.",
      estimatedCost: 12000,
      ingredients: [],
      _ings: ["lechuga", "tomate", "aceite"],
    },
    {
      _key: "tabla",
      name: "Tabla de pan y queso",
      yieldPortions: 8,
      category: "Acompañamiento",
      suitableServices: ["coffee_break", "desayuno"],
      instructions: "Disponer pan y queso en bandejas.",
      estimatedCost: 15000,
      ingredients: [],
      _ings: ["pan", "queso"],
    },
  ];

  const qtyByKey: Record<string, number> = {
    pollo: 2.5,
    limon: 6,
    aceite: 80,
    arroz: 1.2,
    lechuga: 3,
    tomate: 1.5,
    pan: 16,
    queso: 800,
  };

  const event: Omit<EventInput, "clientId" | "recipes"> & {
    _clientIndex: number;
    _recipeKeys: Array<{ key: string; serviceType: EventInput["services"][number]; portions: number }>;
  } = {
    _clientIndex: 0,
    title: "Almuerzo corporativo — Empresa Andina",
    eventDate: eventDate.toISOString(),
    location: "Av. Providencia 1234, Santiago",
    attendees: 40,
    status: "confirmado",
    dietaryRestrictions: "2 vegetarianos, sin mariscos",
    notes: "Datos de ejemplo — puedes editarlos o borrarlos.",
    estimatedCost: 280000,
    services: ["almuerzo"],
    _recipeKeys: [
      { key: "ensalada", serviceType: "almuerzo", portions: 40 },
      { key: "pollo", serviceType: "almuerzo", portions: 40 },
    ],
  };

  return { clients, suppliers, ingredients, recipes, qtyByKey, event };
}
