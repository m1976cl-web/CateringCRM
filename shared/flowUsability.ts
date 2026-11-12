import type { QuoteItem } from "./types";

/** Textos de los flujos de eventos, cotizaciones y stock. */
export const FLOW_COPY = {
  eventLoad: "No se pudo cargar el evento. Revisa la conexión e inténtalo de nuevo.",
  eventsLoad: "No se pudieron cargar los eventos. Revisa la conexión e inténtalo de nuevo.",
  eventSave: "No se pudo guardar el evento.",
  eventSaved: "Evento guardado.",
  setupHint: "Hora de llegada para montar.",
  quotesLoad: "No se pudieron cargar las cotizaciones. Revisa la conexión e inténtalo de nuevo.",
  quoteSave: "No se pudo guardar la cotización.",
  quoteDelete: "No se pudo eliminar la cotización.",
  quoteDeleteConfirm: "Se elimina esta cotización y no se puede recuperar.",
  quoteCopyFail: "No se pudieron copiar los datos del evento.",
  quoteItemsMissing: "Agrega al menos un ítem con descripción y cantidad mayor que cero.",
  quoteNumberHint: "Si lo borras, se asigna un número al guardar.",
  quoteEventHint: "Si la cotización está en blanco, al elegir el evento se copian el ítem y las notas.",
  quoteNoEvents: "Todavía no hay eventos.",
  quoteVersion: "Guarda otra versión en borrador. Esta queda como historial.",
  quoteDuplicate: "Copia los datos a una cotización nueva. Aún no se guarda.",
  ingredientsLoad: "No se pudieron cargar los ingredientes. Revisa la conexión e inténtalo de nuevo.",
  ingredientsSave: "No se pudo guardar el ingrediente.",
  ingredientsDelete: "No se pudo eliminar el ingrediente.",
  ingredientsDeleteConfirm: "Se quita del catálogo. Si una receta todavía lo usa, no se borra.",
  movementsLoad: "No se pudieron cargar los movimientos de este ingrediente.",
  movementSave: "No se pudo registrar el movimiento.",
  ingredientMissing: "Ese ingrediente ya no está en el catálogo.",
  lowStockBadge: "Bajo mínimo",
  stockHintNew: "Cantidad con la que entra al catálogo. Después podrás anotar entradas, mermas y reservas.",
  stockHintEdit:
    "Si cambias el número y guardas, queda anotado como ajuste. Entradas, mermas y reservas se registran abajo.",
  minStockHint: "En Inicio se avisa cuando el stock llega a este número o queda por debajo.",
  unitHint: "g gramos, kg kilos, ml mililitros, L litros, unidad por pieza.",
  kitchenStock: "Con el rol de cocina puedes ver el stock, no cambiarlo.",
  ingredientsSubtitle: "Nombre, unidad, precio, proveedor y stock en bodega.",
  ingredientsEmpty: "Agrega el primero con nombre y unidad. El precio y el stock pueden quedar vacíos.",
  ingredientsSearch: "Prueba con otro nombre o proveedor.",
  eventsEmpty: "Crea un evento y asócialo a un cliente.",
  eventsSearch: "Prueba otro texto o elige Todos para ver la lista completa.",
  quotesEmpty: "Elige un evento en el formulario. Si está en blanco, los datos se copian solos.",
  quotesSearch: "Prueba con otro número, cliente o evento.",
  fieldEventTitle: "Escribe el título del evento.",
  fieldEventClient: "Elige un cliente.",
  fieldEventDate: "Indica la fecha y hora del evento.",
  fieldEventAttendees: "Indica al menos una persona.",
  fieldQuoteEvent: "Elige el evento de esta cotización.",
  fieldQuoteValid: "Indica hasta qué día es válida la cotización.",
  fieldIngredientName: "Escribe el nombre del ingrediente.",
  fieldStockQty: "Indica una cantidad mayor que cero.",
} as const;

export type InvalidFlags = {
  valueMissing: boolean;
  rangeUnderflow: boolean;
  rangeOverflow: boolean;
};

export function invalidFieldMessage(
  flags: InvalidFlags,
  messages: { valueMissing?: string; rangeUnderflow?: string; rangeOverflow?: string },
): string {
  if (flags.valueMissing && messages.valueMissing) return messages.valueMissing;
  if (flags.rangeUnderflow && messages.rangeUnderflow) return messages.rangeUnderflow;
  if (flags.rangeOverflow && messages.rangeOverflow) return messages.rangeOverflow;
  return "";
}

export function emptyListCopy(
  filtering: boolean,
  emptyTitle: string,
  emptyDescription: string,
  filteredDescription: string,
): { title: string; description: string; offerCreate: boolean } {
  if (filtering) {
    return { title: "Nada coincide", description: filteredDescription, offerCreate: false };
  }
  return { title: emptyTitle, description: emptyDescription, offerCreate: true };
}

export function isLowStock(qty: number, min: number): boolean {
  return min > 0 && qty <= min;
}

export function stockQtyHint(editing: boolean): string {
  return editing ? FLOW_COPY.stockHintEdit : FLOW_COPY.stockHintNew;
}

export function isUntouchedQuoteItem(item: QuoteItem): boolean {
  const price = Number(item.unitPrice);
  const quantity = Number(item.quantity);
  return (
    item.description.trim() === "" &&
    !(price > 0) &&
    (quantity === 1 || quantity === 0 || Number.isNaN(quantity))
  );
}

export function canAutofillQuoteFromEvent(input: {
  editing: boolean;
  items: QuoteItem[];
  notes: string;
  paymentCount: number;
}): boolean {
  if (input.editing || input.notes.trim() || input.paymentCount > 0) return false;
  if (input.items.length === 0) return true;
  return input.items.every(isUntouchedQuoteItem);
}

export function quoteItemsForSave(items: QuoteItem[]): { items: QuoteItem[]; error: string | null } {
  const kept = items
    .map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
    }))
    .filter((item) => item.description && item.quantity > 0);
  if (kept.length === 0) {
    return { items: [], error: FLOW_COPY.quoteItemsMissing };
  }
  return { items: kept, error: null };
}

/** Mantiene un vencimiento ya escrito. Si está vacío, usa el día del evento. */
export function dueDateOrEventDay(currentDue: string, eventDateLocal: string): string {
  return currentDue.trim() ? currentDue : eventDateLocal;
}

export function quoteCopiedMessage(hasSalePrice: boolean): string {
  return hasSalePrice
    ? "Se copió el evento. El precio sale de la venta estimada o, si no hay, del costo de ingredientes."
    : "Se copió el evento, pero no hay precio todavía. Escríbelo en el ítem antes de guardar.";
}

export function eventListPaymentNote(
  billed: number,
  balance: number,
  format: (value: number) => string,
): string {
  if (!(billed > 0)) return "";
  if (balance > 0) return `saldo ${format(balance)}`;
  return "pagado";
}
