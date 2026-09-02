import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  formatDate,
  formatDateOnly,
  formatMoney,
  toDatetimeLocal,
  type EventDetail,
  type EventSummary,
  type QuoteSummary,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { QuoteBadge } from "../components/StatusBadge";
import { SearchBar } from "../components/SearchBar";
import { estimateFoodCost } from "../../shared/shopping";
import { matchesQuery } from "../search";
import { loadCompanySettings, quoteTaxBreakdown } from "../settings";
import { quoteMoney } from "../quoteDisplay";
import { nextQuoteNumber } from "../quotes";
import { sumPayments } from "../../shared/quoteLifecycle";
import { whatsappPhoneUrl, whatsappTextUrl } from "../whatsapp";
import { publicQuoteUrl } from "../publicQuote";
import { useAuth } from "../components/AuthGate";
import { canEditQuotes } from "../../shared/roles";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  quoteTotal,
  type PaymentMethod,
  type QuoteItem,
  type QuotePaymentInput,
  type QuoteStatus,
} from "../../shared/types";

const blankItem = (): QuoteItem => ({ description: "", quantity: 1, unitPrice: 0 });

function blankPayment(amount = 0): QuotePaymentInput {
  return {
    amount,
    paidAt: new Date().toISOString(),
    method: "transferencia",
    notes: "",
  };
}

function whatsappQuoteUrl(q: {
  quoteNumber: string | null;
  id: number;
  clientName: string;
  clientPhone?: string | null;
  eventTitle: string;
  total: number;
  iva: number;
  ivaRate: number;
  grandTotal: number;
  deposit: number;
  balance: number;
  items: QuoteItem[];
}): string {
  const lines = [
    `Cotización ${q.quoteNumber || `#${q.id}`}`,
    `Cliente: ${q.clientName}`,
    `Evento: ${q.eventTitle}`,
    "",
    ...q.items.map(
      (i) => `• ${i.description}: ${i.quantity} × ${formatMoney(i.unitPrice)}`,
    ),
    "",
    `Neto: ${formatMoney(q.total)}`,
    ...(q.iva > 0 ? [`IVA ${q.ivaRate}%: ${formatMoney(q.iva)}`] : []),
    `Total: ${formatMoney(q.grandTotal)}`,
    ...(q.deposit > 0
      ? [`Pagado: ${formatMoney(q.deposit)}`, `Saldo: ${formatMoney(q.balance)}`]
      : []),
  ];
  const text = lines.join("\n");
  return whatsappPhoneUrl(q.clientPhone ?? "", text) ?? whatsappTextUrl(text);
}

export function QuotesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [eventId, setEventId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [quoteDate, setQuoteDate] = useState(toDatetimeLocal(new Date()));
  const [status, setStatus] = useState<QuoteStatus>("borrador");
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState<QuotePaymentInput[]>([]);
  const [foodCost, setFoodCost] = useState(0);
  const [saveMsg, setSaveMsg] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([blankItem()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [prefillDone, setPrefillDone] = useState(false);
  const [query, setQuery] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [linkMsg, setLinkMsg] = useState("");
  const settings = loadCompanySettings();

  const total = useMemo(() => quoteTotal(items), [items]);
  const tax = useMemo(() => quoteTaxBreakdown(total, settings), [total, settings]);
  const paid = useMemo(() => sumPayments(payments), [payments]);
  const money = useMemo(() => quoteMoney({ total, depositAmount: paid, foodCost }, settings), [total, paid, foodCost, settings]);
  const visibleQuotes = useMemo(
    () =>
      quotes.filter((q) =>
        matchesQuery(query, q.quoteNumber, q.clientName, q.eventTitle, q.status),
      ),
    [quotes, query],
  );

  async function load() {
    setLoading(true);
    try {
      const [q, e] = await Promise.all([api.listQuotes(), api.listEvents()]);
      setQuotes(q);
      setEvents(e);
      setError("");
      return q;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
      return [] as QuoteSummary[];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load().then((q) => {
      setQuoteNumber((cur) => cur || nextQuoteNumber(q));
    });
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get("eventId");
    if (!fromUrl || prefillDone || events.length === 0) return;
    setEventId(fromUrl);
    void (async () => {
      try {
        await fillFromEventId(Number(fromUrl));
        setPrefillDone(true);
      } catch {
        setPrefillDone(true);
      }
    })();
  }, [searchParams, events, prefillDone]);

  function reset(list: QuoteSummary[] = quotes) {
    setEditingId(null);
    setEventId("");
    setQuoteNumber(nextQuoteNumber(list));
    setQuoteDate(toDatetimeLocal(new Date()));
    setStatus("borrador");
    setNotes("");
    setPayments([]);
    setFoodCost(0);
    setItems([blankItem()]);
    setDueDate("");
  }

  function startEdit(q: QuoteSummary) {
    setEditingId(q.id);
    setEventId(String(q.eventId));
    setQuoteNumber(q.quoteNumber ?? "");
    setQuoteDate(toDatetimeLocal(q.quoteDate));
    setStatus(q.status);
    setNotes(q.notes ?? "");
    setPayments(q.payments?.length ? q.payments.map((p) => ({ ...p })) : []);
    setFoodCost(q.foodCost ?? 0);
    setItems(q.items.length ? q.items : [blankItem()]);
    setDueDate(q.dueDate ? toDatetimeLocal(q.dueDate) : "");
  }

  async function createVersion(q: QuoteSummary) {
    try {
      const created = await api.duplicateQuote(q.id);
      const list = await load();
      const row = list.find((x) => x.id === created.id) ?? created;
      startEdit(row);
      setSaveMsg(`Nueva versión ${created.version} en borrador.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la versión");
    }
  }

  async function copyPublicLink(q: QuoteSummary) {
    if (!q.publicToken) {
      setError("Esta cotización aún no tiene enlace público. Guárdala de nuevo.");
      return;
    }
    const url = publicQuoteUrl(q.publicToken);
    try {
      await navigator.clipboard.writeText(url);
      setLinkMsg(`Enlace copiado: ${url}`);
    } catch {
      setLinkMsg(url);
    }
  }

  function duplicateQuote(q: QuoteSummary) {
    setEditingId(null);
    setEventId(String(q.eventId));
    setQuoteNumber(nextQuoteNumber(quotes));
    setQuoteDate(toDatetimeLocal(new Date()));
    setStatus("borrador");
    setNotes(q.notes ?? "");
    setPayments(q.payments?.length ? q.payments.map((p) => ({ ...p, id: undefined })) : []);
    setFoodCost(q.foodCost ?? 0);
    setItems(q.items.length ? q.items.map((i) => ({ ...i })) : [blankItem()]);
    setDueDate(q.dueDate ? toDatetimeLocal(q.dueDate) : "");
  }

  async function fillFromEventId(id: number) {
    const ev = await api.getEvent(id);
    const ingredients = await api.listIngredients();
    const recipes = await api.listRecipes();
    const byIng = new Map(ingredients.map((i) => [i.id, i]));
    const forCost = ev.recipes.map((row) => {
      const recipe = recipes.find((r) => r.id === row.recipeId);
      return {
        yieldPortions: recipe?.yieldPortions ?? 1,
        portions: row.portions,
        ingredients: (recipe?.ingredients ?? []).map((ing) => {
          const cat = byIng.get(ing.ingredientId);
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
    const estimatedFood = estimateFoodCost(forCost);
    const sale = ev.estimatedCost ?? estimatedFood;
    applyEventFill(ev, sale, estimatedFood);
  }

  function applyEventFill(ev: EventDetail, sale: number, foodCost: number) {
    setItems([
      {
        description: `Servicio de catering — ${ev.title} (${ev.attendees} personas)`,
        quantity: 1,
        unitPrice: Math.round(sale),
      },
    ]);
    setNotes(
      [
        ev.services.length
          ? `Servicios: ${ev.services.map((s) => SERVICE_TYPE_LABELS[s]).join(", ")}`
          : null,
        ev.dietaryRestrictions ? `Restricciones: ${ev.dietaryRestrictions}` : null,
        foodCost > 0 ? `Costo ingredientes estimado: ${formatMoney(foodCost)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    setFoodCost(Math.round(foodCost));
  }

  async function fillFromEvent() {
    if (!eventId) return;
    try {
      await fillFromEventId(Number(eventId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo rellenar desde el evento");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        eventId: Number(eventId),
        quoteNumber: quoteNumber.trim() || nextQuoteNumber(quotes),
        quoteDate: new Date(quoteDate).toISOString(),
        items: items.filter((i) => i.description.trim() && i.quantity > 0),
        notes: notes || null,
        status,
        foodCost,
        payments,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      };
      if (editingId) await api.updateQuote(editingId, payload);
      else await api.createQuote(payload);
      const q = await load();
      reset(q);
      setSaveMsg(
        status === "aceptada"
          ? "Guardada. El evento pasó a Confirmado."
          : status === "enviada"
            ? "Guardada. Si el evento estaba en borrador, ahora está Cotizado."
            : "Cotización guardada.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const wasEditing = editingId === deleteId;
    try {
      await api.deleteQuote(deleteId);
      setDeleteId(null);
      const q = await load();
      if (wasEditing) reset(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setDeleteId(null);
    }
  }

  if (!canEditQuotes(user.role)) {
    return (
      <div className="empty">
        <h2>Cotizaciones</h2>
        <p>Tu rol de cocina no edita cotizaciones. Usa eventos y la hoja de producción.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle="Arma la propuesta desde el evento, imprímela o compártela por WhatsApp."
      />
      {error ? <div className="error-box">{error}</div> : null}
      {saveMsg ? <p className="meta">{saveMsg}</p> : null}
      {linkMsg ? <p className="meta">{linkMsg}</p> : null}

      <div className="split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <h2>{editingId ? "Editar cotización" : "Nueva cotización"}</h2>
          <FormField label="Evento *">
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
              <option value="">Elegir…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} — {ev.clientName} — {formatDate(ev.eventDate)}
                </option>
              ))}
            </select>
          </FormField>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => void fillFromEvent()} disabled={!eventId}>
              Rellenar desde evento
            </button>
          </div>
          <div className="grid-3">
            <FormField label="Número">
              <input
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                placeholder="COT-2026-001"
              />
            </FormField>
            <FormField label="Fecha">
              <input
                type="datetime-local"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
              />
            </FormField>
            <FormField
              label="Estado"
              hint={
                status === "aceptada"
                  ? "Al guardar, el evento queda Confirmado."
                  : status === "enviada"
                    ? "Al guardar, un evento en borrador pasa a Cotizado."
                    : undefined
              }
            >
              <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
                {QUOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {QUOTE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Vencimiento / cobro" hint="Fecha para la cola de cobranza. Por defecto, el día del evento.">
            <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>

          <div>
            <div className="page-header" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Ítems</h3>
              <button
                type="button"
                className="btn"
                onClick={() => setItems([...items, blankItem()])}
              >
                Agregar ítem
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="inline-row" style={{ marginBottom: 8 }}>
                <FormField label="Descripción">
                  <input
                    value={item.description}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...item, description: e.target.value };
                      setItems(next);
                    }}
                    required
                  />
                </FormField>
                <FormField label="Cant.">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...item, quantity: Number(e.target.value) };
                      setItems(next);
                    }}
                  />
                </FormField>
                <FormField label="Precio">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={item.unitPrice}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...item, unitPrice: Number(e.target.value) };
                      setItems(next);
                    }}
                  />
                </FormField>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                >
                  Quitar
                </button>
              </div>
            ))}
            <div className="quote-totals">
              {tax.addIva ? (
                <>
                  <span className="meta">Neto: {formatMoney(tax.net)}</span>
                  <span className="meta">
                    IVA {tax.ivaRate}%: {formatMoney(tax.iva)}
                  </span>
                  <strong className="grand">Total: {formatMoney(tax.total)}</strong>
                </>
              ) : (
                <strong className="grand">Total: {formatMoney(tax.total)}</strong>
              )}
              {money.foodCost > 0 ? (
                <>
                  <span className="meta">Costo ingredientes: {formatMoney(money.foodCost)}</span>
                  <span className={`meta ${money.margin < 0 ? "tone-warn" : ""}`}>
                    Margen: {formatMoney(money.margin)}
                    {money.marginPct != null ? ` (${money.marginPct}%)` : ""}
                  </span>
                </>
              ) : null}
              {money.deposit > 0 ? (
                <>
                  <span className="meta">Pagado: {formatMoney(money.deposit)}</span>
                  <strong>Saldo: {formatMoney(money.balance)}</strong>
                </>
              ) : (
                <span className="meta">Sin abonos · saldo {formatMoney(money.balance)}</span>
              )}
            </div>
          </div>

          <div>
            <div className="page-header" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Abonos</h3>
              <div className="page-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={tax.total <= 0}
                  onClick={() => setPayments([...payments, blankPayment(Math.round(tax.total * 0.3))])}
                >
                  + 30%
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={tax.total <= 0}
                  onClick={() => setPayments([...payments, blankPayment(Math.round(tax.total * 0.5))])}
                >
                  + 50%
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPayments([...payments, blankPayment()])}
                >
                  Agregar abono
                </button>
              </div>
            </div>
            {payments.length === 0 ? (
              <p className="meta">Registra cada pago del cliente. El saldo se ve también en el evento.</p>
            ) : (
              payments.map((pay, idx) => (
                <div key={pay.id ?? `p-${idx}`} className="inline-row" style={{ marginBottom: 8 }}>
                  <FormField label="Monto">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={pay.amount}
                      onChange={(e) => {
                        const next = [...payments];
                        next[idx] = { ...pay, amount: Number(e.target.value) || 0 };
                        setPayments(next);
                      }}
                    />
                  </FormField>
                  <FormField label="Fecha">
                    <input
                      type="datetime-local"
                      value={toDatetimeLocal(pay.paidAt)}
                      onChange={(e) => {
                        const next = [...payments];
                        next[idx] = {
                          ...pay,
                          paidAt: e.target.value ? new Date(e.target.value).toISOString() : pay.paidAt,
                        };
                        setPayments(next);
                      }}
                    />
                  </FormField>
                  <FormField label="Medio">
                    <select
                      value={pay.method}
                      onChange={(e) => {
                        const next = [...payments];
                        next[idx] = { ...pay, method: e.target.value as PaymentMethod };
                        setPayments(next);
                      }}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
                  >
                    Quitar
                  </button>
                </div>
              ))
            )}
          </div>

          <FormField label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>

          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cotización"}
            </button>
            {editingId ? (
              <button type="button" className="btn ghost" onClick={() => reset()}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <section className="panel">
          <h2>Guardadas</h2>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Buscar cotización, cliente o evento…"
          />
          {loading ? (
            <div className="loading">Cargando…</div>
          ) : visibleQuotes.length === 0 ? (
            <EmptyState title="Sin cotizaciones" description="Crea la primera desde un evento." />
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {visibleQuotes.map((q) => {
                const rowMoney = quoteMoney(q, settings);
                return (
                <div key={q.id} className="list-item">
                  <div>
                    <h3>
                      {q.quoteNumber || `Cotización #${q.id}`} — {formatMoney(rowMoney.total)}
                      {q.version > 1 ? ` · v${q.version}` : ""}
                    </h3>
                    <div className="meta">
                      {q.clientName} · {q.eventTitle} · {formatDate(q.quoteDate)}
                      {q.dueDate ? ` · cobro ${formatDateOnly(q.dueDate)}` : ""}
                      {rowMoney.addIva ? ` · IVA ${rowMoney.ivaRate}% incluido` : ""}
                      {rowMoney.foodCost > 0
                        ? ` · margen ${formatMoney(rowMoney.margin)}${rowMoney.marginPct != null ? ` (${rowMoney.marginPct}%)` : ""}`
                        : ""}
                      {rowMoney.deposit > 0
                        ? ` · pagado ${formatMoney(rowMoney.deposit)} · saldo ${formatMoney(rowMoney.balance)}`
                        : ""}
                    </div>
                  </div>
                  <div className="page-actions">
                    <QuoteBadge status={q.status} />
                    <a
                      className="btn"
                      href={whatsappQuoteUrl({
                        ...q,
                        iva: rowMoney.iva,
                        ivaRate: rowMoney.ivaRate,
                        grandTotal: rowMoney.total,
                        deposit: rowMoney.deposit,
                        balance: rowMoney.balance,
                      })}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                    <Link className="btn" to={`/cotizaciones/${q.id}/imprimir`}>
                      Imprimir / PDF
                    </Link>
                    <button type="button" className="btn" onClick={() => void copyPublicLink(q)}>
                      Link público
                    </button>
                    <button type="button" className="btn" onClick={() => startEdit(q)}>
                      Editar
                    </button>
                    <button type="button" className="btn" onClick={() => void createVersion(q)}>
                      Nueva versión
                    </button>
                    <button type="button" className="btn" onClick={() => duplicateQuote(q)}>
                      Duplicar
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => setDeleteId(q.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar cotización"
        message="Esta acción no se puede deshacer."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
