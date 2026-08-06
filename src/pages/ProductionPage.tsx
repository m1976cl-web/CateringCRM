import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, type EventDetail } from "../api";
import { loadCompanySettings } from "../settings";
import { SERVICE_TYPE_LABELS, SERVICE_TYPES, type ServiceType } from "../../shared/types";

export function ProductionPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState("");
  const settings = loadCompanySettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.getEvent(Number(id));
        if (alive) setEvent(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <div className="error-box" style={{ margin: 24 }}>{error}</div>;
  if (!event) return <div className="loading">Cargando hoja de producción…</div>;

  const services = (event.services.length ? event.services : SERVICE_TYPES).filter((s) =>
    event.recipes.some((r) => r.serviceType === s),
  ) as ServiceType[];

  return (
    <div className="print-page">
      <div className="print-actions">
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Imprimir
        </button>
        <Link className="btn" to={`/eventos/${event.id}`}>
          Volver al evento
        </Link>
      </div>

      <header className="print-header">
        <div>
          <h1 style={{ margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
            Hoja de producción
          </h1>
          <p className="print-company-meta">{settings.companyName}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong>{event.title}</strong>
          <div>{formatDate(event.eventDate)}</div>
          <div>{event.attendees} personas</div>
          {event.location ? <div>{event.location}</div> : null}
        </div>
      </header>

      {event.dietaryRestrictions ? (
        <section className="panel" style={{ marginTop: 20 }}>
          <h3>Restricciones / alergias</h3>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{event.dietaryRestrictions}</p>
        </section>
      ) : null}

      {services.map((service) => {
        const rows = event.recipes.filter((r) => r.serviceType === service);
        if (!rows.length) return null;
        return (
          <section key={service} style={{ marginTop: 28 }}>
            <h2>{SERVICE_TYPE_LABELS[service]}</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Receta</th>
                  <th>Porciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.recipeName}</td>
                    <td>{r.portions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {event.notes ? (
        <section style={{ marginTop: 24 }}>
          <h3>Notas del evento</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{event.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
