import { defaultPackingItems } from "../shared/ops";
import { api } from "./api";

export async function seedDemoIfEmpty(): Promise<boolean> {
  if (!(await api.isEmpty())) return false;

  const client = await api.createClient({
    name: "Empresa Demo SpA",
    phone: "+56911112222",
    email: "contacto@empresademo.cl",
    company: "Empresa Demo",
    notes: "Cliente de ejemplo para recorrer la plataforma.",
  });
  const pollo = await api.createIngredient({
    name: "Pechuga de pollo",
    unit: "kg",
    unitPrice: 6500,
    stockQty: 8,
  });
  const arroz = await api.createIngredient({
    name: "Arroz",
    unit: "kg",
    unitPrice: 1800,
    stockQty: 5,
  });
  const leche = await api.createIngredient({
    name: "Leche",
    unit: "L",
    unitPrice: 1200,
    stockQty: 4,
  });
  const recipe = await api.createRecipe({
    name: "Pollo al limón",
    yieldPortions: 10,
    category: "Principal",
    suitableServices: ["almuerzo", "cena"],
    instructions: "Sellar el pollo, agregar limón y hornear 25 minutos.",
    estimatedCost: 45000,
    allergenTags: ["lactosa"],
    ingredients: [
      { ingredientId: pollo.id, quantity: 1.2 },
      { ingredientId: arroz.id, quantity: 0.8 },
      { ingredientId: leche.id, quantity: 0.2 },
    ],
  });

  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 5);
  eventDate.setHours(13, 0, 0, 0);
  const packing = defaultPackingItems();
  packing[0] = { ...packing[0], packed: true };
  const event = await api.createEvent({
    clientId: client.id,
    title: "Almuerzo corporativo de ejemplo",
    eventDate: eventDate.toISOString(),
    location: "Av. Providencia 1234, Santiago",
    attendees: 40,
    status: "cotizado",
    dietaryRestrictions: "2 sin lactosa",
    dietaryTags: ["lactosa"],
    setupTime: "11:30",
    serviceTime: "13:00",
    endTime: "15:30",
    venueContact: "Recepción edificio",
    venuePhone: "+56222223333",
    notes: "Acceso por estacionamiento subterráneo.",
    estimatedCost: 480000,
    packingItems: packing,
    expenses: [{ id: 1, description: "Flete ida y vuelta", amount: 45000, category: "transporte" }],
    staff: [{ id: 1, name: "Camila Soto", role: "servicio", notes: "Jefa de servicio" }],
    services: ["almuerzo"],
    recipes: [{ recipeId: recipe.id, serviceType: "almuerzo", portions: 40 }],
  });

  const due = new Date(eventDate);
  due.setDate(due.getDate() - 2);
  await api.createQuote({
    eventId: event.id,
    quoteNumber: "COT-DEMO-001",
    quoteDate: new Date().toISOString(),
    items: [
      {
        description: "Servicio de catering — Almuerzo corporativo (40 personas)",
        quantity: 1,
        unitPrice: 480000,
      },
    ],
    notes: "Propuesta de ejemplo. Incluye montaje y servicio.",
    status: "enviada",
    foodCost: 180000,
    dueDate: due.toISOString(),
  });
  return true;
}
