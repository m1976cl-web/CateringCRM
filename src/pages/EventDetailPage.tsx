import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  formatMoney,
  toDatetimeLocal,
  type Client,
  type Ingredient,
  type QuoteSummary,
  type Recipe,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FormField } from "../components/FormField";
import { PageHeader } from "../components/EmptyState";
import { QuoteBadge } from "../components/StatusBadge";
import { recipeFitsService } from "../../shared/recipeMeta";
import { estimateFoodCost } from "../../shared/shopping";
import {
  REPEAT_INTERVALS,
  REPEAT_INTERVAL_LABELS,
  shiftEventDate,
  type RepeatInterval,
} from "../../shared/eventSeries";
import { clientMoneyFromQuotes, quoteMoney } from "../quoteDisplay";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  type EventInput,
  type EventStatus,
  type ServiceType,
} from "../../shared/types";
import {
  DIETARY_TAGS,
  DIETARY_TAG_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  defaultPackingItems,
  recipeConflicts,
  sumExpenses,
  type DietaryTag,
  type EventExpense,
  type EventStaff,
  type ExpenseCategory,
  type PackingItem,
  type StaffRole,
} from "../../shared/ops";

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
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [setupTime, setSetupTime] = useState("");
  const [serviceTime, setServiceTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venueContact, setVenueContact] = useState("");
  const [venuePhone, setVenuePhone] = useState("");
  const [packingItems, setPackingItems] = useState<PackingItem[]>(() => defaultPackingItems());
  const [expenses, setExpenses] = useState<EventExpense[]>([]);
  const [staff, setStaff] = useState<EventStaff[]>([]);
  const [notes, setNotes] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [menu, setMenu] = useState<MenuRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!isNew || Boolean(searchParams.get("duplicar")));
  const [saving, setSaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [askUnpaid, setAskUnpaid] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "shopping" | "series" | null>(null);
  const [savedStatus, setSavedStatus] = useState<EventStatus>("borrador");
  const [repeatKind, setRepeatKind] = useState<RepeatInterval | "">("");
  const [repeatExtra, setRepeatExtra] = useState(3);
  const [eventQuotes, setEventQuotes] = useState<QuoteSummary[]>([]);

  const fechaParam = searchParams.get("fecha");
  const duplicarParam = searchParams.get("duplicar");
  const clienteParam = searchParams.get("cliente");

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
          if (clienteParam && /^\d+$/.test(clienteParam)) {
            setClientId(clienteParam);
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
            setDietaryTags(ev.dietaryTags ?? []);
            setSetupTime(ev.setupTime ?? "");
            setServiceTime(ev.serviceTime ?? "");
            setEndTime(ev.endTime ?? "");
            setVenueContact(ev.venueContact ?? "");
            setVenuePhone(ev.venuePhone ?? "");
            setPackingItems(ev.packingItems?.length ? ev.packingItems : defaultPackingItems());
            setExpenses(ev.expenses ?? []);
            setStaff(ev.staff ?? []);
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
          setSavedStatus(ev.status);
          setServices(ev.services);
          setDietary(ev.dietaryRestrictions ?? "");
          setDietaryTags(ev.dietaryTags ?? []);
          setSetupTime(ev.setupTime ?? "");
          setServiceTime(ev.serviceTime ?? "");
          setEndTime(ev.endTime ?? "");
          setVenueContact(ev.venueContact ?? "");
          setVenuePhone(ev.venuePhone ?? "");
          setPackingItems(ev.packingItems?.length ? ev.packingItems : defaultPackingItems());
          setExpenses(ev.expenses ?? []);
          setStaff(ev.staff ?? []);
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
  }, [eventId, isNew, fechaParam, duplicarParam, clienteParam]);

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

  const extraCost = sumExpenses(expenses);
  const totalCost = foodCost + extraCost;
  const salePrice = estimatedCost === "" ? 0 : Number(estimatedCost);
  const marginPct =
    salePrice > 0 && totalCost > 0 ? Math.round(((salePrice - totalCost) / salePrice) * 100) : null;
  const quoteMoneyTotals = useMemo(() => clientMoneyFromQuotes(eventQuotes), [eventQuotes]);
  const latestQuoteMoney = eventQuotes[0] ? quoteMoney(eventQuotes[0]) : null;

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
      dietaryTags,
      setupTime: setupTime || null,
      serviceTime: serviceTime || null,
      endTime: endTime || null,
      venueContact: venueContact || null,
      venuePhone: venuePhone || null,
      packingItems,
      expenses,
      staff,
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

  function needsUnpaidWarning() {
    return status === "realizado" && savedStatus !== "realizado" && quoteMoneyTotals.balance > 0;
  }

  async function createSeriesCopies(payload: EventInput) {
    if (!repeatKind || repeatExtra < 1) return 0;
    const extra = Math.min(24, Math.floor(repeatExtra));
    for (let i = 1; i <= extra; i += 1) {
      await api.createEvent({
        ...payload,
        status: "borrador",
        eventDate: shiftEventDate(payload.eventDate, repeatKind, i),
      });
    }
    return extra;
  }

  async function persistEvent(action: "save" | "shopping" | "series", skipWarn = false) {
    if (action === "shopping") {
      if (services.length === 0) {
        setError("Elige al menos un servicio (desayuno, almuerzo…)");
        return;
      }
      if (menu.length === 0) {
        setError("Agrega recetas al menú antes de generar la lista de compras");
        return;
      }
    }
    if (action === "series") {
      if (!repeatKind || repeatExtra < 1) {
        setError("Elige cada cuánto se repite y cuántas copias extra.");
        return;
      }
    }
    if (!skipWarn && needsUnpaidWarning()) {
      setPendingAction(action);
      setAskUnpaid(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = await api.createEvent(payload);
        const extra = action === "shopping" ? 0 : await createSeriesCopies(payload);
        if (action === "shopping") {
          await api.getShoppingList(created.id, true);
          navigate(`/compras/${created.id}`);
          return;
        }
        navigate(extra > 0 ? "/eventos" : `/eventos/${created.id}`);
        return;
      }
      if (!eventId) throw new Error("No se pudo guardar el evento");
      await api.updateEvent(eventId, payload);
      setSavedStatus(payload.status);
      if (action === "series") {
        const extra = await createSeriesCopies(payload);
        navigate(extra > 0 ? "/eventos" : `/eventos/${eventId}`);
        return;
      }
      if (action === "shopping") {
        await api.getShoppingList(eventId, true);
        navigate(`/compras/${eventId}`);
        return;
      }
      navigate(`/eventos/${eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
      setAskUnpaid(false);
      setPendingAction(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await persistEvent("save");
  }

  async function saveAndGenerateShopping() {
    await persistEvent("shopping");
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

  useEffect(() => {
    if (!eventId || isNew) {
      setEventQuotes([]);
      return;
    }
    let alive = true;
    void api.listQuotes().then((rows) => {
      if (alive) setEventQuotes(rows.filter((q) => q.eventId === eventId));
    });
    return () => {
      alive = false;
    };
  }, [eventId, isNew]);

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

      {!isNew && eventId ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Listo para el día</h2>
          <ul className="ops-checklist">
            <li>
              <span>
                <strong>Menú</strong>
                <span className="meta">
                  {" "}
                  {menu.length
                    ? `${menu.length} receta(s) en ${services.length} servicio(s)`
                    : "Falta armar el menú"}
                </span>
              </span>
              <span className={`badge ${menu.length ? "tone-good" : "tone-warn"}`}>
                {menu.length ? "Listo" : "Pendiente"}
              </span>
            </li>
            <li>
              <span>
                <strong>Compras</strong>
                <span className="meta"> {menu.length ? "Genera o revisa la lista" : "Primero el menú"}</span>
              </span>
              {menu.length ? (
                <Link className="btn" to={`/compras/${eventId}`}>
                  Ver compras
                </Link>
              ) : (
                <span className="badge tone-neutral">—</span>
              )}
            </li>
            <li>
              <span>
                <strong>Cotización</strong>
                <span className="meta">
                  {" "}
                  {eventQuotes.length
                    ? `${eventQuotes.length} guardada(s)${
                        eventQuotes[0].status === "aceptada"
                          ? " · aceptada"
                          : latestQuoteMoney && latestQuoteMoney.deposit > 0
                            ? ` · pagado ${formatMoney(latestQuoteMoney.deposit)}`
                            : ""
                      }`
                    : "Aún no hay propuesta"}
                </span>
              </span>
              {eventQuotes[0] ? (
                <span className="page-actions">
                  <QuoteBadge status={eventQuotes[0].status} />
                  <Link className="btn" to={`/cotizaciones?eventId=${eventId}`}>
                    Ver
                  </Link>
                </span>
              ) : (
                <Link className="btn" to={`/cotizaciones?eventId=${eventId}`}>
                  Cotizar
                </Link>
              )}
            </li>
            <li>
              <span>
                <strong>Pagos</strong>
                <span className="meta">
                  {" "}
                  {quoteMoneyTotals.billed > 0
                    ? `Pagado ${formatMoney(quoteMoneyTotals.paid)} · saldo ${formatMoney(quoteMoneyTotals.balance)}`
                    : "Se calcula sobre cotizaciones aceptadas"}
                </span>
              </span>
              <span
                className={`badge ${
                  quoteMoneyTotals.billed <= 0
                    ? "tone-neutral"
                    : quoteMoneyTotals.balance <= 0
                      ? "tone-good"
                      : "tone-warn"
                }`}
              >
                {quoteMoneyTotals.billed <= 0
                  ? "—"
                  : quoteMoneyTotals.balance <= 0
                    ? "Saldado"
                    : formatMoney(quoteMoneyTotals.balance)}
              </span>
            </li>
            <li>
              <span>
                <strong>Packing</strong>
                <span className="meta">
                  {" "}
                  {packingItems.filter((p) => p.packed).length}/{packingItems.length} listos
                </span>
              </span>
              <span
                className={`badge ${
                  packingItems.length && packingItems.every((p) => p.packed)
                    ? "tone-good"
                    : "tone-warn"
                }`}
              >
                {packingItems.length && packingItems.every((p) => p.packed) ? "Listo" : "Pendiente"}
              </span>
            </li>
            <li>
              <span>
                <strong>Producción</strong>
                <span className="meta"> Hoja para cocina / servicio</span>
              </span>
              {menu.length ? (
                <Link className="btn" to={`/eventos/${eventId}/produccion`}>
                  Abrir hoja
                </Link>
              ) : (
                <span className="badge tone-neutral">—</span>
              )}
            </li>
          </ul>
        </section>
      ) : null}

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

        <div className="grid-3">
          <FormField label="Montaje" hint="Hora de llegada / setup">
            <input type="time" value={setupTime} onChange={(e) => setSetupTime(e.target.value)} />
          </FormField>
          <FormField label="Servicio">
            <input type="time" value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} />
          </FormField>
          <FormField label="Término">
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </FormField>
        </div>

        <div className="grid-2">
          <FormField label="Contacto en el recinto">
            <input value={venueContact} onChange={(e) => setVenueContact(e.target.value)} />
          </FormField>
          <FormField label="Teléfono del recinto">
            <input value={venuePhone} onChange={(e) => setVenuePhone(e.target.value)} />
          </FormField>
        </div>

        <div className="grid-2">
          <FormField
            label="Se repite"
            hint={
              isNew
                ? "Crea más fechas con el mismo menú y cliente."
                : "Opcional: guarda este evento y crea fechas a futuro."
            }
          >
            <select
              value={repeatKind}
              onChange={(e) => setRepeatKind((e.target.value || "") as RepeatInterval | "")}
            >
              <option value="">No se repite</option>
              {REPEAT_INTERVALS.map((kind) => (
                <option key={kind} value={kind}>
                  {REPEAT_INTERVAL_LABELS[kind]}
                </option>
              ))}
            </select>
          </FormField>
          {repeatKind ? (
            <FormField label="Copias extra" hint="Además de este evento. Máximo 24.">
              <input
                type="number"
                min={1}
                max={24}
                value={repeatExtra}
                onChange={(e) => setRepeatExtra(Math.max(1, Number(e.target.value) || 1))}
              />
            </FormField>
          ) : null}
        </div>

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
        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Alergias / dietas del evento
          </div>
          <div className="chips">
            {DIETARY_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`chip ${dietaryTags.includes(tag) ? "on" : ""}`}
                onClick={() =>
                  setDietaryTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
              >
                {DIETARY_TAG_LABELS[tag]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <FormField
            label="Costo estimado (venta)"
            hint={
              totalCost > 0
                ? `Costo ingredientes ≈ ${formatMoney(foodCost)}${
                    extraCost > 0 ? ` + extras ${formatMoney(extraCost)}` : ""
                  }${marginPct != null ? ` · margen ${marginPct}%` : ""}. Puedes usarlo como base.`
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

        <section>
          <h3 style={{ marginBottom: 8 }}>Lista de packing / montaje</h3>
          <p className="meta" style={{ marginTop: 0 }}>
            Marca lo que ya está listo para cargar. Se imprime también en la hoja de producción.
          </p>
          {packingItems.map((item, idx) => (
            <div key={item.id} className="inline-row" style={{ marginBottom: 8, alignItems: "center" }}>
              <label className="inline-row" style={{ flex: 1 }}>
                <input
                  type="checkbox"
                  checked={item.packed}
                  onChange={(e) => {
                    const next = [...packingItems];
                    next[idx] = { ...item, packed: e.target.checked };
                    setPackingItems(next);
                  }}
                />
                <input
                  value={item.label}
                  onChange={(e) => {
                    const next = [...packingItems];
                    next[idx] = { ...item, label: e.target.value };
                    setPackingItems(next);
                  }}
                />
              </label>
              <input
                type="number"
                min={1}
                style={{ maxWidth: 80 }}
                value={item.quantity}
                onChange={(e) => {
                  const next = [...packingItems];
                  next[idx] = { ...item, quantity: Math.max(1, Number(e.target.value) || 1) };
                  setPackingItems(next);
                }}
              />
              <button
                type="button"
                className="btn danger"
                onClick={() => setPackingItems(packingItems.filter((_, i) => i !== idx))}
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              setPackingItems([
                ...packingItems,
                {
                  id: Math.max(0, ...packingItems.map((p) => p.id)) + 1,
                  label: "",
                  quantity: 1,
                  packed: false,
                },
              ])
            }
          >
            Agregar ítem
          </button>
        </section>

        <section>
          <h3 style={{ marginBottom: 8 }}>Gastos del evento</h3>
          <p className="meta" style={{ marginTop: 0 }}>
            Transporte, personal extra, arriendo… se restan del precio de venta para ver el margen real.
            {extraCost > 0 ? ` Extra acumulado: ${formatMoney(extraCost)}.` : ""}
          </p>
          {expenses.map((row, idx) => (
            <div key={row.id} className="inline-row" style={{ marginBottom: 8 }}>
              <FormField label="Descripción">
                <input
                  value={row.description}
                  onChange={(e) => {
                    const next = [...expenses];
                    next[idx] = { ...row, description: e.target.value };
                    setExpenses(next);
                  }}
                />
              </FormField>
              <FormField label="Monto">
                <input
                  type="number"
                  min={0}
                  value={row.amount}
                  onChange={(e) => {
                    const next = [...expenses];
                    next[idx] = { ...row, amount: Math.max(0, Number(e.target.value) || 0) };
                    setExpenses(next);
                  }}
                />
              </FormField>
              <FormField label="Tipo">
                <select
                  value={row.category}
                  onChange={(e) => {
                    const next = [...expenses];
                    next[idx] = { ...row, category: e.target.value as ExpenseCategory };
                    setExpenses(next);
                  }}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </FormField>
              <button
                type="button"
                className="btn danger"
                onClick={() => setExpenses(expenses.filter((_, i) => i !== idx))}
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              setExpenses([
                ...expenses,
                {
                  id: Math.max(0, ...expenses.map((x) => x.id)) + 1,
                  description: "",
                  amount: 0,
                  category: "otro",
                },
              ])
            }
          >
            Agregar gasto
          </button>
        </section>

        <section>
          <h3 style={{ marginBottom: 8 }}>Personal del servicio</h3>
          {staff.map((row, idx) => (
            <div key={row.id} className="inline-row" style={{ marginBottom: 8 }}>
              <FormField label="Nombre">
                <input
                  value={row.name}
                  onChange={(e) => {
                    const next = [...staff];
                    next[idx] = { ...row, name: e.target.value };
                    setStaff(next);
                  }}
                />
              </FormField>
              <FormField label="Rol">
                <select
                  value={row.role}
                  onChange={(e) => {
                    const next = [...staff];
                    next[idx] = { ...row, role: e.target.value as StaffRole };
                    setStaff(next);
                  }}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {STAFF_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Notas">
                <input
                  value={row.notes ?? ""}
                  onChange={(e) => {
                    const next = [...staff];
                    next[idx] = { ...row, notes: e.target.value || null };
                    setStaff(next);
                  }}
                />
              </FormField>
              <button
                type="button"
                className="btn danger"
                onClick={() => setStaff(staff.filter((_, i) => i !== idx))}
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              setStaff([
                ...staff,
                {
                  id: Math.max(0, ...staff.map((x) => x.id)) + 1,
                  name: "",
                  role: "servicio",
                  notes: null,
                },
              ])
            }
          >
            Agregar persona
          </button>
        </section>

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
                        const conflicts = recipe
                          ? recipeConflicts(recipe.allergenTags ?? [], dietaryTags)
                          : [];
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
                            {conflicts.length ? (
                              <p className="error-inline" style={{ margin: "0 0 8px" }}>
                                Conflicto con dieta del evento:{" "}
                                {conflicts.map((t) => DIETARY_TAG_LABELS[t]).join(", ")}
                              </p>
                            ) : null}
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
            {saving
              ? "Guardando…"
              : isNew && repeatKind
                ? "Guardar serie"
                : "Guardar evento"}
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
          {!isNew && repeatKind ? (
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => void persistEvent("series")}
            >
              {saving ? "Creando…" : "Crear serie a futuro"}
            </button>
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
      <ConfirmDialog
        open={askUnpaid}
        title="Hay saldo por cobrar"
        message={`Hay ${formatMoney(quoteMoneyTotals.balance)} pendiente en cotizaciones aceptadas. ¿Marcar el evento como realizado de todas formas?`}
        confirmLabel="Marcar realizado igual"
        danger={false}
        onCancel={() => {
          setAskUnpaid(false);
          setPendingAction(null);
        }}
        onConfirm={() => {
          const action = pendingAction ?? "save";
          void persistEvent(action, true);
        }}
      />
    </div>
  );
}
