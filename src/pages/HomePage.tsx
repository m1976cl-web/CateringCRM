import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  formatDate,
  formatMoney,
  getDataMode,
  isSameCalendarDay,
  type Dashboard,
  type EventSummary,
  type Ingredient,
  type QuoteSummary,
} from "../api";
import { PageHeader } from "../components/EmptyState";
import { QuoteBadge, StatusBadge } from "../components/StatusBadge";
import { clientMoneyFromQuotes, quoteMoney } from "../quoteDisplay";

export function HomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const mode = getDataMode();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [d, isEmpty, evs, qs, ings] = await Promise.all([
        api.dashboard(),
        api.isEmpty(),
        api.listEvents(),
        api.listQuotes(),
        api.listIngredients(),
      ]);
      setData(d);
      setEmpty(isEmpty);
      setEvents(evs);
      setQuotes(qs);
      setIngredients(ings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el inicio");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const todayEvents = useMemo(
    () => events.filter((ev) => isSameCalendarDay(ev.eventDate)),
    [events],
  );
  const pendingQuotes = useMemo(
    () => quotes.filter((q) => q.status === "enviada" || q.status === "borrador"),
    [quotes],
  );
  const zeroStock = useMemo(() => {
    const usesStock = ingredients.some((i) => (i.stockQty ?? 0) > 0);
    if (!usesStock) return [];
    return ingredients.filter((i) => (i.stockQty ?? 0) <= 0);
  }, [ingredients]);

  if (loading) return <div className="loading">Cargando resumen…</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Hoy en tu catering"
        subtitle="Resumen simple de lo que viene y lo que falta."
      />

      {mode === "static" ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Activa la nube para el equipo</h2>
          <p className="meta">
            Ahora mismo los datos quedan solo en este dispositivo. Para que el celular y el PC
            vean lo mismo, conecta Supabase (pasos en Ajustes).
          </p>
          <Link className="btn primary" to="/ajustes">
            Ir a Ajustes
          </Link>
        </section>
      ) : null}

      {empty ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Empieza aquí</h2>
          <p className="meta">
            Aún no hay datos. Registra clientes, ingredientes y recetas, y crea tu primer evento
            para generar listas de compras y cotizaciones.
          </p>
        </section>
      ) : null}

      <div className="quick-actions">
        <Link className="btn primary" to="/eventos/nuevo">
          Nuevo evento
        </Link>
        <Link className="btn" to="/clientes">
          Agregar cliente
        </Link>
        <Link className="btn" to="/compras">
          Lista de compras
        </Link>
        <Link className="btn" to="/cotizaciones">
          Cotizaciones
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <strong>{todayEvents.length}</strong>
          <span>Hoy</span>
        </div>
        <div className="stat">
          <strong>{data.counts.events}</strong>
          <span>Eventos</span>
        </div>
        <div className="stat">
          <strong>{data.counts.clients}</strong>
          <span>Clientes</span>
        </div>
        <div className="stat">
          <strong>{data.counts.pendingShoppingLists}</strong>
          <span>Compras pendientes</span>
        </div>
      </div>

      {todayEvents.length > 0 ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Hoy</h2>
          <div className="list" style={{ marginTop: 12 }}>
            {todayEvents.map((ev) => {
              const money = clientMoneyFromQuotes(quotes.filter((q) => q.eventId === ev.id));
              return (
              <Link key={ev.id} to={`/eventos/${ev.id}`} className="list-item">
                <div>
                  <h3>{ev.title}</h3>
                  <div className="meta">
                    {ev.clientName} · {formatDate(ev.eventDate)} · {ev.attendees} personas
                    {money.billed > 0 ? ` · saldo ${formatMoney(money.balance)}` : ""}
                  </div>
                </div>
                <StatusBadge status={ev.status} />
              </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {zeroStock.length > 0 ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Stock en cero</h2>
          <p className="meta">
            {zeroStock.length} ingrediente(s) sin bodega. La lista de compras los pedirá completos.
          </p>
          <div className="chip-row" style={{ marginTop: 8 }}>
            {zeroStock.slice(0, 12).map((i) => (
              <Link key={i.id} to="/ingredientes" className="badge tone-warn">
                {i.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="split">
        <section className="panel">
          <h2>Próximos 14 días</h2>
          {data.upcoming.length === 0 ? (
            <p className="meta">No hay eventos próximos. Crea el primero.</p>
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {data.upcoming.map((ev) => (
                <Link key={ev.id} to={`/eventos/${ev.id}`} className="list-item">
                  <div>
                    <h3>{ev.title}</h3>
                    <div className="meta">
                      {ev.clientName} · {formatDate(ev.eventDate)} · {ev.attendees} personas
                    </div>
                  </div>
                  <StatusBadge status={ev.status} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Atención</h2>
          <p className="meta">
            {data.alerts.needsAttention} evento(s) aún en borrador o cotizado.
          </p>
          <p className="meta">{data.alerts.confirmedSoon} confirmado(s) en los próximos días.</p>
          {pendingQuotes.length ? (
            <div className="list" style={{ marginTop: 12 }}>
              {pendingQuotes.slice(0, 5).map((q) => {
                const money = quoteMoney(q);
                return (
                  <Link key={q.id} to="/cotizaciones" className="list-item">
                    <div>
                      <h3>
                        {q.quoteNumber || `Cotización #${q.id}`} — {formatMoney(money.total)}
                      </h3>
                      <div className="meta">
                        {q.clientName} · {q.eventTitle}
                        {money.deposit > 0 ? ` · saldo ${formatMoney(money.balance)}` : ""}
                      </div>
                    </div>
                    <QuoteBadge status={q.status} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="meta" style={{ marginTop: 16 }}>
              Tip: abre un evento, elige las recetas del menú y genera la lista de compras con un
              clic.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
