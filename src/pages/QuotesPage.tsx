import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  formatDate,
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
import { nextQuoteNumber } from "../quotes";
import { whatsappPhoneUrl, whatsappTextUrl } from "../whatsapp";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  quoteTotal,
  type QuoteItem,
  type QuoteStatus,
} from "../../shared/types";

const blankItem = (): QuoteItem => ({ description: "", quantity: 1, unitPrice: 0 });

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
  ];
  const text = lines.join("\n");
  return whatsappPhoneUrl(q.clientPhone ?? "", text) ?? whatsappTextUrl(text);
}

export function QuotesPage() {
  const [searchParams] = useSearchParams();
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [eventId, setEventId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [quoteDate, setQuoteDate] = useState(toDatetimeLocal(new Date()));
  const [status, setStatus] = useState<QuoteStatus>("borrador");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([blankItem()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [prefillDone, setPrefillDone] = useState(false);
  const [query, setQuery] = useState("");
  const settings = loadCompanySettings();

  const total = useMemo(() => quoteTotal(items), [items]);
  const tax = useMemo(() => quoteTaxBreakdown(total, settings), [total, settings]);
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
    setItems([blankItem()]);
  }

  function startEdit(q: QuoteSummary) {
    setEditingId(q.id);
    setEventId(String(q.eventId));
    setQuoteNumber(q.quoteNumber ?? "");
    setQuoteDate(toDatetimeLocal(q.quoteDate));
    setStatus(q.status);
    setNotes(q.notes ?? "");
    setItems(q.items.length ? q.items : [blankItem()]);
  }

  function duplicateQuote(q: QuoteSummary) {
    setEditingId(null);
    setEventId(String(q.eventId));
    setQuoteNumber(nextQuoteNumber(quotes));
    setQuoteDate(toDatetimeLocal(new Date()));
    setStatus("borrador");
    setNotes(q.notes ?? "");
    setItems(q.items.length ? q.items.map((i) => ({ ...i })) : [blankItem()]);
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
    const foodCost = estimateFoodCost(forCost);
    const sale = ev.estimatedCost ?? foodCost;
    applyEventFill(ev, sale, foodCost);
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
      };
      if (editingId) await api.updateQuote(editingId, payload);
      else await api.createQuote(payload);
      const q = await load();
      reset(q);
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

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle="Arma la propuesta desde el evento, imprímela o compártela por WhatsApp."
      />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <h2>{editingId ? "Editar cotización" : "Nueva cotización"}</h2>
          <FormField label="Evento *">
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
              <option value="">Elegir…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} — {ev.clientName}
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
            <FormField label="Estado">
              <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
                {QUOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {QUOTE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

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
            </div>
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
                const rowTax = quoteTaxBreakdown(q.total, settings);
                return (
                <div key={q.id} className="list-item">
                  <div>
                    <h3>
                      {q.quoteNumber || `Cotización #${q.id}`} — {formatMoney(rowTax.total)}
                    </h3>
                    <div className="meta">
                      {q.clientName} · {q.eventTitle} · {formatDate(q.quoteDate)}
                      {rowTax.addIva ? ` · IVA ${rowTax.ivaRate}% incluido` : ""}
                    </div>
                  </div>
                  <div className="page-actions">
                    <QuoteBadge status={q.status} />
                    <a
                      className="btn"
                      href={whatsappQuoteUrl({
                        ...q,
                        iva: rowTax.iva,
                        ivaRate: rowTax.ivaRate,
                        grandTotal: rowTax.total,
                      })}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                    <Link className="btn" to={`/cotizaciones/${q.id}/imprimir`}>
                      Imprimir / PDF
                    </Link>
                    <button type="button" className="btn" onClick={() => startEdit(q)}>
                      Editar
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
