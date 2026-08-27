import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, formatMoney, type EventSummary, type QuoteSummary } from "../api";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { SearchBar } from "../components/SearchBar";
import { StatusBadge } from "../components/StatusBadge";
import { matchesQuery } from "../search";
import { clientMoneyFromQuotes } from "../quoteDisplay";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  type EventStatus,
} from "../../shared/types";

export function EventsPage() {
  const [rows, setRows] = useState<EventSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [filter, setFilter] = useState<EventStatus | "todos">("todos");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [data, qs] = await Promise.all([api.listEvents(), api.listQuotes()]);
        if (alive) {
          setRows(data);
          setQuotes(qs);
        }
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

  const filtered = useMemo(() => {
    const byStatus = filter === "todos" ? rows : rows.filter((r) => r.status === filter);
    return byStatus.filter((r) =>
      matchesQuery(query, r.title, r.clientName, r.location, ...r.services.map((s) => SERVICE_TYPE_LABELS[s])),
    );
  }, [rows, filter, query]);

  return (
    <div>
      <PageHeader
        title="Eventos"
        subtitle="Fecha, asistentes y servicios (desayuno, almuerzo, coffee break…)."
        actions={
          <Link className="btn primary" to="/eventos/nuevo">
            Nuevo evento
          </Link>
        }
      />

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Buscar por título, cliente o lugar…"
      />

      <div className="chips" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`chip ${filter === "todos" ? "on" : ""}`}
          onClick={() => setFilter("todos")}
        >
          Todos
        </button>
        {EVENT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${filter === s ? "on" : ""}`}
            onClick={() => setFilter(s)}
          >
            {EVENT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {loading ? (
        <div className="loading">Cargando eventos…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query || filter !== "todos" ? "Nada coincide" : "No hay eventos"}
          description={
            query || filter !== "todos"
              ? "Prueba otro filtro o búsqueda."
              : "Crea un evento y asócialo a un cliente."
          }
          actionTo="/eventos/nuevo"
          actionLabel="Crear evento"
        />
      ) : (
        <div className="list">
          {filtered.map((ev) => {
            const money = clientMoneyFromQuotes(quotes.filter((q) => q.eventId === ev.id));
            return (
            <Link key={ev.id} to={`/eventos/${ev.id}`} className="list-item">
              <div>
                <h3>{ev.title}</h3>
                <div className="meta">
                  {ev.clientName} · {formatDate(ev.eventDate)} · {ev.attendees} personas
                  {money.billed > 0
                    ? ` · saldo ${formatMoney(money.balance)}`
                    : ""}
                </div>
                <div className="meta">
                  {ev.services.map((s) => SERVICE_TYPE_LABELS[s]).join(" · ")}
                </div>
              </div>
              <StatusBadge status={ev.status} />
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
