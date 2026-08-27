import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, type Client, type EventDetail, type Recipe } from "../api";
import { loadCompanySettings } from "../settings";
import { scaleRecipeLines } from "../../shared/shopping";
import { SERVICE_TYPE_LABELS, SERVICE_TYPES, type ServiceType } from "../../shared/types";
import { whatsappPhoneUrl } from "../whatsapp";

export function ProductionPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState("");
  const settings = loadCompanySettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [data, recs] = await Promise.all([api.getEvent(Number(id)), api.listRecipes()]);
        let clientRow: Client | null = null;
        try {
          clientRow = await api.getClient(data.clientId);
        } catch {
          clientRow = null;
        }
        if (alive) {
          setEvent(data);
          setRecipes(recs);
          setClient(clientRow);
        }
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
  const wa = whatsappPhoneUrl(client?.phone ?? "");

  return (
    <div className="print-page">
      <div className="print-actions">
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Imprimir
        </button>
        {wa ? (
          <a className="btn" href={wa} target="_blank" rel="noreferrer">
            WhatsApp cliente
          </a>
        ) : null}
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

      <section className="panel" style={{ marginTop: 20 }}>
        <h3>Cliente</h3>
        <p style={{ margin: 0 }}>
          {client?.name ?? event.clientName}
          {client?.company ? ` · ${client.company}` : ""}
        </p>
        {client?.phone ? <p className="meta" style={{ margin: "6px 0 0" }}>{client.phone}</p> : null}
      </section>

      {event.dietaryRestrictions ? (
        <section className="banner banner-danger" style={{ marginTop: 16 }}>
          <strong>Restricciones / alergias</strong>
          <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0", fontWeight: 500 }}>
            {event.dietaryRestrictions}
          </p>
        </section>
      ) : null}

      {services.map((service) => {
        const rows = event.recipes.filter((r) => r.serviceType === service);
        if (!rows.length) return null;
        return (
          <section key={service} style={{ marginTop: 28 }}>
            <h2>{SERVICE_TYPE_LABELS[service]}</h2>
            {rows.map((r) => {
              const recipe = recipes.find((x) => x.id === r.recipeId);
              const lines = recipe
                ? scaleRecipeLines(recipe.yieldPortions, r.portions, recipe.ingredients)
                : [];
              return (
                <article key={r.id} className="prod-recipe">
                  <h3>
                    {r.recipeName}{" "}
                    <span className="meta">· {r.portions} porciones</span>
                  </h3>
                  {lines.length ? (
                    <ul className="mise-list">
                      {lines.map((line) => (
                        <li key={`${line.name}-${line.unit}`}>
                          <strong>
                            {line.quantity} {line.unit}
                          </strong>{" "}
                          {line.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="meta">Sin ingredientes en la receta.</p>
                  )}
                  {recipe?.instructions ? (
                    <p className="prod-instructions">{recipe.instructions}</p>
                  ) : null}
                </article>
              );
            })}
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
