import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, formatMoney, type EventSummary, type ShoppingList } from "../api";
import { EmptyState, PageHeader } from "../components/EmptyState";

export function ShoppingPage() {
  const { eventId: eventIdParam } = useParams();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedId, setSelectedId] = useState(eventIdParam ?? "");
  const [list, setList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
      return;
    }
    let alive = true;
    (async () => {
      setBusy(true);
      try {
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
    return [...map.entries()];
  }, [list]);

  async function regenerate() {
    if (!selectedId) return;
    setBusy(true);
    try {
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

  const selectedEvent = events.find((e) => String(e.id) === selectedId);

  return (
    <div>
      <PageHeader
        title="Lista de compras"
        subtitle="Se calcula desde las recetas del evento, escaladas por porciones."
        actions={
          <div className="page-actions">
            <button type="button" className="btn" disabled={!selectedId || busy} onClick={() => void regenerate()}>
              Regenerar lista
            </button>
            <button type="button" className="btn primary" disabled={!list || busy} onClick={() => void markAllDone()}>
              Marcar todo comprado
            </button>
          </div>
        }
      />

      <div className="panel" style={{ marginBottom: 16 }}>
        <FormSelect
          events={events}
          selectedId={selectedId}
          onChange={setSelectedId}
        />
        {selectedEvent ? (
          <p className="meta" style={{ marginTop: 8 }}>
            {selectedEvent.title} · {formatDate(selectedEvent.eventDate)} ·{" "}
            <Link to={`/eventos/${selectedEvent.id}`}>Ver evento</Link>
          </p>
        ) : null}
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {loading || busy ? <div className="loading">Cargando lista…</div> : null}

      {!loading && !selectedId ? (
        <EmptyState
          title="Elige un evento"
          description="O crea un evento con recetas en el menú."
          actionTo="/eventos/nuevo"
          actionLabel="Nuevo evento"
        />
      ) : null}

      {list && !busy ? (
        list.items.length === 0 ? (
          <EmptyState
            title="Lista vacía"
            description="Agrega recetas al menú del evento y regenera la lista."
            actionTo={selectedId ? `/eventos/${selectedId}` : "/eventos"}
            actionLabel="Ir al evento"
          />
        ) : (
          <div className="stack">
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
