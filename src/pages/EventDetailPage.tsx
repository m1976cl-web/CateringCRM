import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  toDatetimeLocal,
  type Client,
  type Recipe,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FormField } from "../components/FormField";
import { PageHeader } from "../components/EmptyState";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  type EventStatus,
  type ServiceType,
} from "../../shared/types";

type MenuRow = { recipeId: number; serviceType: ServiceType; portions: number };

export function EventDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === "nuevo";
  const eventId = isNew ? null : Number(id);
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [attendees, setAttendees] = useState(20);
  const [status, setStatus] = useState<EventStatus>("borrador");
  const [services, setServices] = useState<ServiceType[]>(["almuerzo"]);
  const [dietary, setDietary] = useState("");
  const [notes, setNotes] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [menu, setMenu] = useState<MenuRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, r] = await Promise.all([api.listClients(), api.listRecipes()]);
        if (!alive) return;
        setClients(c);
        setRecipes(r);
        if (!isNew && eventId) {
          const ev = await api.getEvent(eventId);
          if (!alive) return;
          setTitle(ev.title);
          setClientId(String(ev.clientId));
          setEventDate(toDatetimeLocal(ev.eventDate));
          setLocation(ev.location ?? "");
          setAttendees(ev.attendees);
          setStatus(ev.status);
          setServices(ev.services);
          setDietary(ev.dietaryRestrictions ?? "");
          setNotes(ev.notes ?? "");
          setEstimatedCost(ev.estimatedCost != null ? String(ev.estimatedCost) : "");
          setMenu(
            ev.recipes.map((x) => ({
              recipeId: x.recipeId,
              serviceType: x.serviceType,
              portions: x.portions,
            })),
          );
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId, isNew]);

  function toggleService(s: ServiceType) {
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function addMenuRow() {
    const firstService = services[0] ?? "almuerzo";
    const firstRecipe = recipes[0]?.id;
    if (!firstRecipe) {
      setError("Primero crea una receta en el módulo Recetas");
      return;
    }
    setMenu((prev) => [
      ...prev,
      { recipeId: firstRecipe, serviceType: firstService, portions: attendees },
    ]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        clientId: Number(clientId),
        eventDate: new Date(eventDate).toISOString(),
        location: location || null,
        attendees,
        status,
        dietaryRestrictions: dietary || null,
        notes: notes || null,
        estimatedCost: estimatedCost === "" ? null : Number(estimatedCost),
        services,
        recipes: menu,
      };
      if (isNew) {
        const created = await api.createEvent(payload);
        navigate(`/eventos/${created.id}`);
      } else if (eventId) {
        await api.updateEvent(eventId, payload);
        navigate(`/eventos/${eventId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!eventId) return;
    try {
      await api.deleteEvent(eventId);
      navigate("/eventos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setAskDelete(false);
    }
  }

  if (loading) return <div className="loading">Cargando evento…</div>;

  return (
    <div>
      <PageHeader
        title={isNew ? "Nuevo evento" : "Editar evento"}
        subtitle="Marca los servicios del día y el menú de recetas."
        actions={
          !isNew && eventId ? (
            <>
              <Link className="btn" to={`/compras/${eventId}`}>
                Lista de compras
              </Link>
              <Link className="btn" to="/cotizaciones">
                Cotizar
              </Link>
            </>
          ) : null
        }
      />

      {error ? <div className="error-box">{error}</div> : null}

      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="grid-2">
          <FormField label="Título *">
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label="Cliente *">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Elegir…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid-3">
          <FormField label="Fecha y hora *">
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Asistentes *">
            <input
              type="number"
              min={1}
              value={attendees}
              onChange={(e) => setAttendees(Number(e.target.value))}
              required
            />
          </FormField>
          <FormField label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
              {EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EVENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Lugar">
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </FormField>

        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Servicios del evento *
          </div>
          <div className="chips">
            {SERVICE_TYPES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${services.includes(s) ? "on" : ""}`}
                onClick={() => toggleService(s)}
              >
                {SERVICE_TYPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <FormField label="Restricciones alimentarias">
          <textarea
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
            placeholder="Ej. 3 vegetarianos, 1 sin gluten"
          />
        </FormField>

        <div className="grid-2">
          <FormField label="Costo estimado">
            <input
              type="number"
              min={0}
              step="0.01"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
            />
          </FormField>
          <FormField label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>

        <section>
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Menú (recetas)</h2>
            <button type="button" className="btn" onClick={addMenuRow}>
              Agregar receta
            </button>
          </div>
          {menu.length === 0 ? (
            <p className="meta">Sin recetas aún. Agrégalas para poder armar la lista de compras.</p>
          ) : (
            <div className="stack">
              {menu.map((row, idx) => (
                <div key={idx} className="inline-row">
                  <FormField label="Receta">
                    <select
                      value={row.recipeId}
                      onChange={(e) => {
                        const next = [...menu];
                        next[idx] = { ...row, recipeId: Number(e.target.value) };
                        setMenu(next);
                      }}
                    >
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Servicio">
                    <select
                      value={row.serviceType}
                      onChange={(e) => {
                        const next = [...menu];
                        next[idx] = {
                          ...row,
                          serviceType: e.target.value as ServiceType,
                        };
                        setMenu(next);
                      }}
                    >
                      {SERVICE_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {SERVICE_TYPE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Porciones">
                    <input
                      type="number"
                      min={1}
                      value={row.portions}
                      onChange={(e) => {
                        const next = [...menu];
                        next[idx] = { ...row, portions: Number(e.target.value) };
                        setMenu(next);
                      }}
                    />
                  </FormField>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => setMenu(menu.filter((_, i) => i !== idx))}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar evento"}
          </button>
          <Link className="btn ghost" to="/eventos">
            Volver
          </Link>
          {!isNew ? (
            <button type="button" className="btn danger" onClick={() => setAskDelete(true)}>
              Eliminar
            </button>
          ) : null}
        </div>
      </form>

      <ConfirmDialog
        open={askDelete}
        title="Eliminar evento"
        message="Se borrarán también sus cotizaciones y listas de compras."
        onCancel={() => setAskDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
