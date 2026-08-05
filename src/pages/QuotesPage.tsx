import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  formatDate,
  formatMoney,
  toDatetimeLocal,
  type EventSummary,
  type QuoteSummary,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { QuoteBadge } from "../components/StatusBadge";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  quoteTotal,
  type QuoteItem,
  type QuoteStatus,
} from "../../shared/types";

const blankItem = (): QuoteItem => ({ description: "", quantity: 1, unitPrice: 0 });

export function QuotesPage() {
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

  const total = useMemo(() => quoteTotal(items), [items]);

  async function load() {
    setLoading(true);
    try {
      const [q, e] = await Promise.all([api.listQuotes(), api.listEvents()]);
      setQuotes(q);
      setEvents(e);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function reset() {
    setEditingId(null);
    setEventId("");
    setQuoteNumber("");
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

  function fillFromEvent() {
    const ev = events.find((e) => String(e.id) === eventId);
    if (!ev) return;
    setItems([
      {
        description: `Servicio de catering — ${ev.title} (${ev.attendees} personas)`,
        quantity: 1,
        unitPrice: ev.estimatedCost ?? 0,
      },
      ...ev.services.map((s) => ({
        description: `Servicio: ${s.replace("_", " ")}`,
        quantity: ev.attendees,
        unitPrice: 0,
      })),
    ]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        eventId: Number(eventId),
        quoteNumber: quoteNumber || null,
        quoteDate: new Date(quoteDate).toISOString(),
        items: items.filter((i) => i.description.trim() && i.quantity > 0),
        notes: notes || null,
        status,
      };
      if (editingId) await api.updateQuote(editingId, payload);
      else await api.createQuote(payload);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await api.deleteQuote(deleteId);
      setDeleteId(null);
      if (editingId === deleteId) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setDeleteId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle="Arma la propuesta, imprímela o guárdala como PDF desde el navegador."
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
            <button type="button" className="btn" onClick={fillFromEvent} disabled={!eventId}>
              Rellenar desde evento
            </button>
          </div>
          <div className="grid-3">
            <FormField label="Número">
              <input
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                placeholder="COT-001"
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
                    step="0.01"
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
            <p>
              <strong>Total: {formatMoney(total)}</strong>
            </p>
          </div>

          <FormField label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>

          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cotización"}
            </button>
            {editingId ? (
              <button type="button" className="btn ghost" onClick={reset}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <section className="panel">
          <h2>Guardadas</h2>
          {loading ? (
            <div className="loading">Cargando…</div>
          ) : quotes.length === 0 ? (
            <EmptyState title="Sin cotizaciones" description="Crea la primera desde un evento." />
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {quotes.map((q) => (
                <div key={q.id} className="list-item">
                  <div>
                    <h3>
                      {q.quoteNumber || `Cotización #${q.id}`} — {formatMoney(q.total)}
                    </h3>
                    <div className="meta">
                      {q.clientName} · {q.eventTitle} · {formatDate(q.quoteDate)}
                    </div>
                  </div>
                  <div className="page-actions">
                    <QuoteBadge status={q.status} />
                    <Link className="btn" to={`/cotizaciones/${q.id}/imprimir`}>
                      Imprimir / PDF
                    </Link>
                    <button type="button" className="btn" onClick={() => startEdit(q)}>
                      Editar
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
              ))}
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
