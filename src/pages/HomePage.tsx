import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  canClearAllData,
  formatDate,
  formatMoney,
  getDataMode,
  isSameCalendarDay,
  type Dashboard,
  type EventSummary,
  type QuoteSummary,
} from "../api";
import { PageHeader } from "../components/EmptyState";
import { QuoteBadge, StatusBadge } from "../components/StatusBadge";
import { quoteTaxBreakdown } from "../settings";

export function HomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(api.wasDemoSeeded());
  const [busy, setBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const mode = getDataMode();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [d, isEmpty, evs, qs] = await Promise.all([
        api.dashboard(),
        api.isEmpty(),
        api.listEvents(),
        api.listQuotes(),
      ]);
      setData(d);
      setEmpty(isEmpty);
      setEvents(evs);
      setQuotes(qs);
      setDemoSeeded(api.wasDemoSeeded());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el inicio");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSeed() {
    setBusy(true);
    setSeedMsg("");
    try {
      await api.seedDemo();
      setSeedMsg("Listo: cargamos clientes, recetas y un evento de ejemplo.");
      await load();
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : "No se pudieron cargar los datos de ejemplo");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (!canClearAllData()) {
      setSeedMsg("En modo servidor no se puede borrar todo desde aquí.");
      return;
    }
    if (!window.confirm("¿Borrar todos los datos de este almacenamiento?")) return;
    setBusy(true);
    setSeedMsg("");
    try {
      await api.clearAll();
      setSeedMsg("Datos borrados. Puedes cargar el ejemplo otra vez o empezar de cero.");
      await load();
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : "No se pudieron borrar los datos");
    } finally {
      setBusy(false);
    }
  }

  const todayEvents = useMemo(
    () => events.filter((ev) => isSameCalendarDay(ev.eventDate)),
    [events],
  );
  const pendingQuotes = useMemo(
    () => quotes.filter((q) => q.status === "enviada" || q.status === "borrador"),
    [quotes],
  );

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
        <section className="panel demo-panel" style={{ marginBottom: 16 }}>
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

      {empty && (
        <section className="panel demo-panel">
          <h2>Empieza con un ejemplo</h2>
          <p className="meta">
            Aún no hay datos. Carga un set de prueba (clientes, proveedores, recetas y un evento) para
            ver cómo funciona. Luego puedes editarlo o borrarlo.
          </p>
          <div className="quick-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void onSeed()}>
              {busy ? "Cargando…" : "Cargar datos de ejemplo"}
            </button>
          </div>
          {seedMsg ? <p className="meta" style={{ marginTop: 10 }}>{seedMsg}</p> : null}
        </section>
      )}

      {!empty && demoSeeded && canClearAllData() && (
        <section className="panel demo-panel demo-panel-soft">
          <p className="meta" style={{ margin: 0 }}>
            Estás viendo datos de ejemplo.{" "}
            <button type="button" className="linkish" disabled={busy} onClick={() => void onClear()}>
              Borrar datos de ejemplo
            </button>
          </p>
          {seedMsg ? <p className="meta" style={{ marginTop: 8 }}>{seedMsg}</p> : null}
        </section>
      )}

      {!empty && !demoSeeded && seedMsg ? (
        <p className="meta" style={{ marginBottom: 12 }}>{seedMsg}</p>
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
            {todayEvents.map((ev) => (
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
                const tax = quoteTaxBreakdown(q.total);
                return (
                  <Link key={q.id} to="/cotizaciones" className="list-item">
                    <div>
                      <h3>
                        {q.quoteNumber || `Cotización #${q.id}`} — {formatMoney(tax.total)}
                      </h3>
                      <div className="meta">
                        {q.clientName} · {q.eventTitle}
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
