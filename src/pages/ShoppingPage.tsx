import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  formatDate,
  formatMoney,
  type EventSummary,
  type PurchaseOrder,
  type ShoppingList,
  type Supplier,
} from "../api";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { useAuth } from "../components/AuthGate";
import { canEditPrices } from "../../shared/roles";
import { PURCHASE_ORDER_STATUS_LABELS } from "../../shared/procurement";
import { SERVICE_TYPE_LABELS } from "../../shared/types";
import { whatsappPhoneUrl, whatsappTextUrl } from "../whatsapp";

function shoppingText(
  title: string,
  items: ShoppingList["items"],
  supplierName?: string,
): string {
  return [
    "Lista de compras",
    title,
    supplierName && supplierName !== "Sin proveedor" ? `Proveedor: ${supplierName}` : "",
    "",
    ...items.map(
      (i) => `${i.purchased ? "☑" : "☐"} ${i.quantity} ${i.unit} ${i.name}`,
    ),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function supplierWhatsApp(
  suppliers: Supplier[],
  supplierId: number | null,
  text: string,
): string {
  const phone = supplierId
    ? suppliers.find((s) => s.id === supplierId)?.phone
    : undefined;
  return (phone ? whatsappPhoneUrl(phone, text) : null) ?? whatsappTextUrl(text);
}

export function ShoppingPage() {
  const { user } = useAuth();
  const canBuy = canEditPrices(user.role);
  const { eventId: eventIdParam } = useParams();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState(eventIdParam ?? "");
  const [list, setList] = useState<ShoppingList | null>(null);
  const [menuCount, setMenuCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emptyMenu, setEmptyMenu] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rows, supplierRows] = await Promise.all([api.listEvents(), api.listSuppliers()]);
        if (!alive) return;
        setEvents(rows);
        setSuppliers(supplierRows);
        if (!selectedId && rows[0]) setSelectedId(String(rows[0].id));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error al cargar eventos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (eventIdParam) setSelectedId(eventIdParam);
  }, [eventIdParam]);

  useEffect(() => {
    if (!selectedId) {
      setList(null);
      setOrders([]);
      setEmptyMenu(false);
      setMenuCount(0);
      return;
    }
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const detail = await api.getEvent(Number(selectedId));
        if (!alive) return;
        setMenuCount(detail.recipes.length);
        if (detail.recipes.length === 0) {
          setEmptyMenu(true);
          setList(null);
          setOrders(await api.listPurchaseOrders(Number(selectedId)));
          setError("");
          return;
        }
        setEmptyMenu(false);
        const [data, orderRows] = await Promise.all([
          api.getShoppingList(Number(selectedId)),
          api.listPurchaseOrders(Number(selectedId)),
        ]);
        if (alive) {
          setList(data);
          setOrders(orderRows);
          setError("");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar la lista");
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { name: string; supplierId: number | null; items: ShoppingList["items"] }
    >();
    for (const item of list?.items ?? []) {
      const key = item.supplierId != null ? String(item.supplierId) : "none";
      const name = item.supplierName ?? "Sin proveedor";
      const arr = map.get(key);
      if (arr) arr.items.push(item);
      else map.set(key, { name, supplierId: item.supplierId, items: [item] });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [list]);

  const remaining = list?.items.filter((i) => !i.purchased).length ?? 0;
  const estimate = useMemo(() => {
    if (!list) return 0;
    return list.items.reduce(
      (sum, item) => sum + (item.unitPrice != null ? item.quantity * item.unitPrice : 0),
      0,
    );
  }, [list]);

  const selectedEvent = events.find((e) => String(e.id) === selectedId);

  const serviceSummary = useMemo(() => {
    if (!selectedEvent) return "";
    return selectedEvent.services.map((s) => SERVICE_TYPE_LABELS[s]).join(", ");
  }, [selectedEvent]);

  async function regenerate() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const detail = await api.getEvent(Number(selectedId));
      setMenuCount(detail.recipes.length);
      if (detail.recipes.length === 0) {
        setEmptyMenu(true);
        setList(null);
        setError("");
        return;
      }
      setEmptyMenu(false);
      const [data, orderRows] = await Promise.all([
        api.getShoppingList(Number(selectedId), true),
        api.listPurchaseOrders(Number(selectedId)),
      ]);
      setList(data);
      setOrders(orderRows);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo regenerar");
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(id: number, purchased: boolean) {
    if (!selectedId || !list) return;
    const nextItems = list.items.map((i) => (i.id === id ? { ...i, purchased } : i));
    setList({ ...list, items: nextItems });
    try {
      const updated = await api.updateShoppingList(Number(selectedId), {
        items: [{ id, purchased }],
      });
      setList(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }

  async function markAllDone() {
    if (!selectedId || !list) return;
    setBusy(true);
    try {
      const updated = await api.updateShoppingList(Number(selectedId), {
        items: list.items.map((i) => ({ id: i.id, purchased: true })),
        status: "comprado",
      });
      setList(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  }

  async function createOrders() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.createPurchaseOrders(Number(selectedId));
      setOrders(await api.listPurchaseOrders(Number(selectedId)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la orden");
    } finally {
      setBusy(false);
    }
  }

  async function receiveOrder(order: PurchaseOrder, form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    try {
      await api.receivePurchaseOrder(order.id, {
        invoiceNumber: String(data.get("invoiceNumber") ?? ""),
        invoiceTotal: String(data.get("invoiceTotal") ?? "") === "" ? null : Number(data.get("invoiceTotal")),
        items: order.items.map((item) => ({
          id: item.id,
          receivedQty: Number(data.get(`qty-${item.id}`) ?? item.quantity),
        })),
      });
      const [dataList, orderRows] = await Promise.all([
        api.getShoppingList(Number(selectedId)),
        api.listPurchaseOrders(Number(selectedId)),
      ]);
      setList(dataList);
      setOrders(orderRows);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recibir la orden");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(id: number) {
    setBusy(true);
    try {
      await api.cancelPurchaseOrder(id);
      setOrders(await api.listPurchaseOrders(Number(selectedId)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar la orden");
    } finally {
      setBusy(false);
    }
  }

  const orderTotal = (order: PurchaseOrder) =>
    order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <div>
      <PageHeader
        title="Lista de compras"
        subtitle="Se calcula desde el menú del evento: cantidad de la receta × (porciones del evento ÷ rendimiento)."
        actions={
          <div className="page-actions">
            {list && list.items.length > 0 ? (
              <>
                <button type="button" className="btn" onClick={() => window.print()}>
                  Imprimir
                </button>
                <a
                  className="btn"
                  href={whatsappTextUrl(
                    shoppingText(selectedEvent?.title ?? "", list.items),
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp lista
                </a>
              </>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={!selectedId || busy || emptyMenu}
              onClick={() => void regenerate()}
            >
              Regenerar desde el menú
            </button>
            {canBuy ? (
              <button
                type="button"
                className="btn primary"
                disabled={!selectedId || busy || !list || remaining === 0}
                onClick={() => void createOrders()}
              >
                Crear orden con lo pendiente
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={!list || busy}
              onClick={() => void markAllDone()}
            >
              Marcar todo comprado
            </button>
          </div>
        }
      />

      <div className="panel" style={{ marginBottom: 16 }}>
        <FormSelect events={events} selectedId={selectedId} onChange={setSelectedId} />
        {selectedEvent ? (
          <div style={{ marginTop: 10 }}>
            <p className="meta" style={{ margin: 0 }}>
              <Link to={`/eventos/${selectedEvent.id}`}>{selectedEvent.title}</Link>
              {" · "}
              {formatDate(selectedEvent.eventDate)} · {selectedEvent.attendees} personas
              {serviceSummary ? ` · ${serviceSummary}` : ""}
              {menuCount ? ` · ${menuCount} receta(s) en menú` : ""}
            </p>
            <p className="meta" style={{ marginTop: 6 }}>
              Las cantidades ya están escaladas al número de porciones de cada receta en el evento.
              Si cambias el menú, pulsa <strong>Regenerar desde el menú</strong>.
            </p>
          </div>
        ) : null}
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {loading || busy ? <div className="loading">Cargando lista…</div> : null}

      {!loading && !selectedId ? (
        <EmptyState
          title="Elige un evento"
          description="O crea un evento, planifica el menú por servicio y genera la lista."
          actionTo="/eventos/nuevo"
          actionLabel="Nuevo evento"
        />
      ) : null}

      {!loading && !busy && emptyMenu && selectedId ? (
        <EmptyState
          title="Este evento aún no tiene menú"
          description="Agrega recetas por servicio (desayuno, almuerzo…) y vuelve a generar la lista de compras."
          actionTo={`/eventos/${selectedId}`}
          actionLabel="Planificar menú"
        />
      ) : null}

      {list && !busy && !emptyMenu ? (
        list.items.length === 0 ? (
          <EmptyState
            title="Lista vacía"
            description="Las recetas del menú no tienen ingredientes. Complétalas en Recetas y regenera."
            actionTo="/recetas"
            actionLabel="Ir a recetas"
          />
        ) : (
          <div className="stack">
            <p className="meta">
              Agrupado por proveedor · {list.items.length} ítem(s) · {remaining} pendiente(s)
              {estimate > 0 ? ` · estimado ${formatMoney(estimate)}` : ""} · generada{" "}
              {formatDate(list.generatedAt)}
            </p>
            {grouped.map((group) => {
              const text = shoppingText(
                selectedEvent?.title ?? "",
                group.items,
                group.name,
              );
              const wa = supplierWhatsApp(suppliers, group.supplierId, text);
              return (
              <section key={group.supplierId ?? "none"} className="panel">
                <div className="page-header" style={{ marginBottom: 8 }}>
                  <h2 style={{ margin: 0 }}>{group.name}</h2>
                  <a className="btn" href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </div>
                {group.items.map((item) => (
                  <label
                    key={item.id}
                    className={`check-row ${item.purchased ? "done" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.purchased}
                      disabled={!canBuy}
                      onChange={(e) => void toggleItem(item.id, e.target.checked)}
                    />
                    <span>
                      <strong>
                        {item.quantity} {item.unit}
                      </strong>{" "}
                      {item.name}
                      {item.unitPrice != null ? (
                        <span className="meta">
                          {" "}
                          · ~{formatMoney(item.quantity * item.unitPrice)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </section>
              );
            })}
            <p className="meta">
              Si vas a recibir una orden, no marques esos ítems a mano: la recepción los marca y suma la bodega.
            </p>
            <p className="meta">
              <Link to={`/eventos/${selectedId}`}>← Volver al evento</Link>
              {" · "}
              <Link to="/recetas">Editar recetas</Link>
            </p>
          </div>
        )
      ) : null}

      {selectedId && !loading ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Órdenes al proveedor</h2>
          <p className="meta">
            Una orden por proveedor con lo que aún no está comprado. Al recibirla puedes anotar el número de factura.
          </p>
          {orders.length === 0 ? (
            <p className="meta">Todavía no hay órdenes para este evento.</p>
          ) : (
            orders.map((order) => (
              <article key={order.id} style={{ marginTop: 16 }}>
                <div className="page-header" style={{ marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>
                    {order.supplierName ?? "Sin proveedor"} · {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                  </h3>
                  <span className="meta">{formatMoney(order.invoiceTotal ?? orderTotal(order))}</span>
                </div>
                <ul className="checklist">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} {item.unit} {item.name}
                      {item.receivedQty > 0 ? ` · recibido ${item.receivedQty}` : ""}
                      {item.unitPrice > 0 ? ` · ${formatMoney(item.quantity * item.unitPrice)}` : ""}
                    </li>
                  ))}
                </ul>
                {order.invoiceNumber ? <p className="meta">Factura {order.invoiceNumber}</p> : null}
                {canBuy && (order.status === "enviada" || order.status === "borrador") ? (
                  <form
                    className="form-grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void receiveOrder(order, e.currentTarget);
                    }}
                  >
                    {order.items.map((item) => (
                      <label key={item.id} className="field">
                        <span className="field-label">
                          Recibir {item.name} ({item.unit})
                        </span>
                        <input
                          name={`qty-${item.id}`}
                          type="number"
                          min={item.receivedQty}
                          step="0.001"
                          defaultValue={item.quantity}
                        />
                      </label>
                    ))}
                    <div className="grid-2">
                      <label className="field">
                        <span className="field-label">Nº factura</span>
                        <input name="invoiceNumber" defaultValue={order.invoiceNumber ?? ""} />
                      </label>
                      <label className="field">
                        <span className="field-label">Total factura</span>
                        <input name="invoiceTotal" type="number" min={0} step="1" />
                      </label>
                    </div>
                    <div className="page-actions">
                      <button className="btn primary" type="submit" disabled={busy}>
                        Recibir
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => void cancelOrder(order.id)}
                      >
                        Cancelar orden
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}

function FormSelect({
  events,
  selectedId,
  onChange,
}: {
  events: EventSummary[];
  selectedId: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">Evento</span>
      <select value={selectedId} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegir evento…</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.title} — {formatDate(ev.eventDate)}
          </option>
        ))}
      </select>
    </label>
  );
}
