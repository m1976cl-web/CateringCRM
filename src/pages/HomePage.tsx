import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, type Dashboard } from "../api";
import { PageHeader } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";

export function HomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.dashboard();
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar el inicio");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="loading">Cargando resumen…</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Hoy en tu catering"
        subtitle="Resumen simple de lo que viene y lo que falta."
      />

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
          <strong>{data.counts.events}</strong>
          <span>Eventos</span>
        </div>
        <div className="stat">
          <strong>{data.counts.clients}</strong>
          <span>Clientes</span>
        </div>
        <div className="stat">
          <strong>{data.counts.recipes}</strong>
          <span>Recetas</span>
        </div>
        <div className="stat">
          <strong>{data.counts.pendingShoppingLists}</strong>
          <span>Compras pendientes</span>
        </div>
      </div>

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
          <p className="meta" style={{ marginTop: 16 }}>
            Tip: abre un evento, elige las recetas del menú y genera la lista de compras con un
            clic.
          </p>
        </section>
      </div>
    </div>
  );
}
