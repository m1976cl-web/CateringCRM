import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  formatMoney,
  toDatetimeLocal,
  type Client,
  type Ingredient,
  type Recipe,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FormField } from "../components/FormField";
import { PageHeader } from "../components/EmptyState";
import { recipeFitsService } from "../../shared/recipeMeta";
import { estimateFoodCost } from "../../shared/shopping";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  type EventStatus,
  type ServiceType,
} from "../../shared/types";

type MenuRow = {
  key: string;
  recipeId: number;
  serviceType: ServiceType;
  portions: number;
  /** Si true, las porciones siguen el nº de asistentes. */
  syncAttendees: boolean;
};

let menuKeySeq = 0;
function nextMenuKey() {
  menuKeySeq += 1;
  return `m-${menuKeySeq}`;
}

export function EventDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === "nuevo";
  const eventId = isNew ? null : Number(id);
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
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
  const [loading, setLoading] = useState(!isNew || Boolean(searchParams.get("duplicar")));
  const [saving, setSaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  const fechaParam = searchParams.get("fecha");
  const duplicarParam = searchParams.get("duplicar");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, r, ings] = await Promise.all([
          api.listClients(),
          api.listRecipes(),
          api.listIngredients(),
        ]);
        if (!alive) return;
        setClients(c);
        setRecipes(r);
        setIngredients(ings);
        const fecha = fechaParam;
        const duplicarId = Number(duplicarParam || 0);
        if (isNew) {
          if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            setEventDate(`${fecha}T12:00`);
          }
          if (duplicarId) {
            const ev = await api.getEvent(duplicarId);
            if (!alive) return;
            setTitle(`${ev.title} (copia)`);
            setClientId(String(ev.clientId));
            setLocation(ev.location ?? "");
            setAttendees(ev.attendees);
            setStatus("borrador");
            setServices(ev.services);
            setDietary(ev.dietaryRestrictions ?? "");
            setNotes(ev.notes ?? "");
            setEstimatedCost(ev.estimatedCost != null ? String(ev.estimatedCost) : "");
            setMenu(
              ev.recipes.map((x) => ({
                key: nextMenuKey(),
                recipeId: x.recipeId,
                serviceType: x.serviceType,
                portions: x.portions,
                syncAttendees: x.portions === ev.attendees,
              })),
            );
            if (!(fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha))) {
              const next = new Date(ev.eventDate);
              next.setDate(next.getDate() + 7);
              setEventDate(toDatetimeLocal(next));
            }
          }
        } else if (eventId) {
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
              key: nextMenuKey(),
              recipeId: x.recipeId,
              serviceType: x.serviceType,
              portions: x.portions,
              syncAttendees: x.portions === ev.attendees,
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
  }, [eventId, isNew, fechaParam, duplicarParam]);

  function setAttendeesAndSync(n: number) {
    const value = Math.max(1, n);
    setAttendees(value);
    setMenu((prev) =>
      prev.map((row) => (row.syncAttendees ? { ...row, portions: value } : row)),
    );
  }

  function toggleService(s: ServiceType) {
    setServices((prev) => {
      if (prev.includes(s)) {
        setMenu((m) => m.filter((row) => row.serviceType !== s));
        return prev.filter((x) => x !== s);
      }
      return [...prev, s];
    });
  }

  function addRecipeToService(serviceType: ServiceType) {
    const suitable = recipes.filter((r) =>
      recipeFitsService(r.suitableServices, serviceType),
    );
    const pick = suitable[0] ?? recipes[0];
    if (!pick) {
      setError("Primero crea una receta en el módulo Recetas");
      return;
    }
    setMenu((prev) => [
      ...prev,
      {
        key: nextMenuKey(),
        recipeId: pick.id,
        serviceType,
        portions: attendees,
        syncAttendees: true,
      },
    ]);
  }

  function updateMenuRow(key: string, patch: Partial<MenuRow>) {
    setMenu((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeMenuRow(key: string) {
    setMenu((prev) => prev.filter((row) => row.key !== key));
  }

  function syncAllPortions() {
    setMenu((prev) => prev.map((row) => ({ ...row, portions: attendees, syncAttendees: true })));
  }

  const foodCost = useMemo(() => {
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    const forCost = menu.map((row) => {
      const recipe = recipes.find((r) => r.id === row.recipeId);
      return {
        yieldPortions: recipe?.yieldPortions ?? 1,
        portions: row.portions,
        ingredients: (recipe?.ingredients ?? []).map((ing) => {
          const cat = byId.get(ing.ingredientId);
          return {
            ingredientId: ing.ingredientId,
            name: cat?.name ?? ing.name,
            unit: cat?.unit ?? ing.unit,
            quantity: ing.quantity,
            supplierId: cat?.supplierId ?? null,
            supplierName: cat?.supplierName ?? null,
            unitPrice: cat?.unitPrice ?? null,
          };
        }),
      };
    });
    return estimateFoodCost(forCost);
  }, [menu, recipes, ingredients]);

  const salePrice = estimatedCost === "" ? 0 : Number(estimatedCost);
  const marginPct =
    salePrice > 0 && foodCost > 0 ? Math.round(((salePrice - foodCost) / salePrice) * 100) : null;

  const menuByService = useMemo(() => {
    const map = new Map<ServiceType, MenuRow[]>();
    for (const s of services) map.set(s, []);
    for (const row of menu) {
      if (!map.has(row.serviceType)) continue;
      map.get(row.serviceType)!.push(row);
    }
    return map;
  }, [menu, services]);

  const summaryParts = services.map((s) => {
    const count = menuByService.get(s)?.length ?? 0;
    return `${SERVICE_TYPE_LABELS[s]}: ${count} receta${count === 1 ? "" : "s"}`;
  });

  function buildPayload() {
    return {
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
      recipes: menu.map(({ recipeId, serviceType, portions }) => ({
        recipeId,
        serviceType,
        portions,
      })),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = buildPayload();
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

  async function saveAndGenerateShopping() {
    if (services.length === 0) {
      setError("Elige al menos un servicio (desayuno, almuerzo…)");
      return;
    }
    if (menu.length === 0) {
      setError("Agrega recetas al menú antes de generar la lista de compras");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = buildPayload();
      let id = eventId;
      if (isNew) {
        const created = await api.createEvent(payload);
        id = created.id;
      } else if (eventId) {
        await api.updateEvent(eventId, payload);
      }
      if (!id) throw new Error("No se pudo guardar el evento");
      await api.getShoppingList(id, true);
      navigate(`/compras/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la lista");
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
        subtitle="Elige los servicios del día, arma el menú por servicio y genera la lista de compras."
        actions={
          !isNew && eventId ? (
            <>
              <Link className="btn" to={`/eventos/nuevo?duplicar=${eventId}`}>
                Duplicar
              </Link>
              <Link className="btn" to={`/compras/${eventId}`}>
                Ver compras
              </Link>
              <Link className="btn" to={`/cotizaciones?eventId=${eventId}`}>
                Cotizar
              </Link>
              <Link className="btn" to={`/eventos/${eventId}/produccion`}>
                Hoja de producción
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
          <FormField
            label="Asistentes *"
            hint="Las porciones del menú se actualizan solas (salvo que las hayas fijado a mano)."
          >
            <input
              type="number"
              min={1}
              value={attendees}
              onChange={(e) => setAttendeesAndSync(Number(e.target.value))}
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
          <FormField
            label="Costo estimado (venta)"
            hint={
              foodCost > 0
                ? `Costo ingredientes ≈ ${formatMoney(foodCost)}${
                    marginPct != null ? ` · margen ${marginPct}%` : ""
                  }. Puedes usarlo como base.`
                : "Se calcula solo si los ingredientes tienen precio."
            }
          >
            <div className="inline-row">
              <input
                type="number"
                min={0}
                step="1"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
              />
              {foodCost > 0 ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEstimatedCost(String(Math.round(foodCost)))}
                >
                  Usar costo ingredientes
                </button>
              ) : null}
            </div>
          </FormField>
          <FormField label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>

        <section className="menu-planner">
          <div className="page-header" style={{ marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Planificar menú</h2>
              <p className="meta" style={{ margin: "6px 0 0" }}>
                Para cada servicio, elige recetas y porciones (por defecto = asistentes).
              </p>
            </div>
            {menu.length > 0 ? (
              <button type="button" className="btn ghost" onClick={syncAllPortions}>
                Porciones = {attendees} asistentes
              </button>
            ) : null}
          </div>

          {services.length === 0 ? (
            <p className="meta">Marca arriba al menos un servicio (desayuno, almuerzo…).</p>
          ) : null}

          {!recipes.length ? (
            <div className="empty-inline">
              <p className="meta">
                No hay recetas todavía.{" "}
                <Link to="/recetas">Crear recetas</Link> con ingredientes y rendimiento.
              </p>
            </div>
          ) : null}

          <div className="stack">
            {services.map((service) => {
              const rows = menuByService.get(service) ?? [];
              return (
                <div key={service} className="service-block">
                  <div className="service-block-head">
                    <h3>{SERVICE_TYPE_LABELS[service]}</h3>
                    <button
                      type="button"
                      className="btn"
                      disabled={!recipes.length}
                      onClick={() => addRecipeToService(service)}
                    >
                      Agregar receta
                    </button>
                  </div>

                  {rows.length === 0 ? (
                    <p className="meta">
                      Sin recetas en este servicio. Agrega al menos una para incluirlo en compras.
                    </p>
                  ) : (
                    <div className="stack" style={{ gap: 10 }}>
                      {rows.map((row) => {
                        const recipe = recipes.find((r) => r.id === row.recipeId);
                        const options = recipes.filter(
                          (r) =>
                            r.id === row.recipeId ||
                            recipeFitsService(r.suitableServices, service),
                        );
                        const list = options.length ? options : recipes;
                        const scale =
                          recipe && recipe.yieldPortions > 0
                            ? row.portions / recipe.yieldPortions
                            : 1;
                        return (
                          <div key={row.key} className="menu-row">
                            <FormField label="Receta">
                              <select
                                value={row.recipeId}
                                onChange={(e) =>
                                  updateMenuRow(row.key, {
                                    recipeId: Number(e.target.value),
                                  })
                                }
                              >
                                {list.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                    {r.category ? ` (${r.category})` : ""} — rinde{" "}
                                    {r.yieldPortions}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <FormField
                              label="Porciones"
                              hint={
                                row.syncAttendees
                                  ? "Sigue a los asistentes"
                                  : "Fijada a mano"
                              }
                            >
                              <input
                                type="number"
                                min={1}
                                value={row.portions}
                                onChange={(e) =>
                                  updateMenuRow(row.key, {
                                    portions: Math.max(1, Number(e.target.value)),
                                    syncAttendees: false,
                                  })
                                }
                              />
                            </FormField>
                            <div className="menu-row-meta">
                              <span className="meta">
                                Escala ×{scale.toFixed(2)}
                                {recipe
                                  ? ` (base ${recipe.yieldPortions} → ${row.portions})`
                                  : ""}
                              </span>
                              <div className="page-actions">
                                {!row.syncAttendees ? (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    onClick={() =>
                                      updateMenuRow(row.key, {
                                        portions: attendees,
                                        syncAttendees: true,
                                      })
                                    }
                                  >
                                    = asistentes
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="btn danger"
                                  onClick={() => removeMenuRow(row.key)}
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="menu-summary">
            <strong>
              Para {attendees} persona{attendees === 1 ? "" : "s"}
            </strong>
            <span className="meta">
              {summaryParts.length ? summaryParts.join(" · ") : "Sin servicios"}
              {menu.length > 0 ? " → listo para generar compras" : ""}
            </span>
          </div>
        </section>

        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar evento"}
          </button>
          <button
            type="button"
            className="btn accent"
            disabled={saving}
            onClick={() => void saveAndGenerateShopping()}
          >
            {saving ? "Generando…" : "Generar lista de compras"}
          </button>
          <Link className="btn ghost" to="/eventos">
            Volver
          </Link>
          {!isNew && eventId ? (
            <Link className="btn" to={`/eventos/nuevo?duplicar=${eventId}`}>
              Duplicar para otra fecha
            </Link>
          ) : null}
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
