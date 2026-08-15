import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, formatMoney, type EventSummary, type ShoppingList } from "../api";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { SERVICE_TYPE_LABELS } from "../../shared/types";

export function ShoppingPage() {
  const { eventId: eventIdParam } = useParams();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedId, setSelectedId] = useState(eventIdParam ?? "");
  const [list, setList] = useState<ShoppingList | null>(null);
  const [menuCount, setMenuCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emptyMenu, setEmptyMenu] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await api.listEvents();
        if (!alive) return;
        setEvents(rows);
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
          setError("");
          return;
        }
        setEmptyMenu(false);
        const data = await api.getShoppingList(Number(selectedId));
        if (alive) {
          setList(data);
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
    const map = new Map<string, ShoppingList["items"]>();
    for (const item of list?.items ?? []) {
      const key = item.supplierName ?? "Sin proveedor";
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
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
      setList(await api.getShoppingList(Number(selectedId), true));
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
                  href={`https://wa.me/?text=${encodeURIComponent(
                    [
                      "Lista de compras",
                      selectedEvent ? selectedEvent.title : "",
                      "",
                      ...list.items.map(
                        (i) =>
                          `${i.purchased ? "☑" : "☐"} ${i.quantity} ${i.unit} ${i.name}`,
                      ),
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
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
            <button
              type="button"
              className="btn primary"
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
            {grouped.map(([supplier, items]) => (
              <section key={supplier} className="panel">
                <h2>{supplier}</h2>
                {items.map((item) => (
                  <label
                    key={item.id}
                    className={`check-row ${item.purchased ? "done" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.purchased}
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
            ))}
            <p className="meta">
              <Link to={`/eventos/${selectedId}`}>← Volver al evento</Link>
              {" · "}
              <Link to="/recetas">Editar recetas</Link>
            </p>
          </div>
        )
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
