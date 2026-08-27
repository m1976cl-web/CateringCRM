import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, formatMoney, type Client, type EventSummary, type QuoteSummary } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { SearchBar } from "../components/SearchBar";
import { QuoteBadge, StatusBadge } from "../components/StatusBadge";
import { matchesQuery } from "../search";
import { clientMoneyFromQuotes, quoteMoney } from "../quoteDisplay";
import { whatsappPhoneUrl } from "../whatsapp";

const blank = { name: "", phone: "", email: "", company: "", notes: "" };

export function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [clients, evs, qs] = await Promise.all([
        api.listClients(),
        api.listEvents(),
        api.listQuotes(),
      ]);
      setRows(clients);
      setEvents(evs);
      setQuotes(qs);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(c: Client) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      company: c.company ?? "",
      notes: c.notes ?? "",
    });
  }

  const visible = useMemo(
    () => rows.filter((c) => matchesQuery(query, c.name, c.company, c.phone, c.email)),
    [rows, query],
  );
  const clientEvents = useMemo(
    () => (editingId ? events.filter((e) => e.clientId === editingId) : []),
    [events, editingId],
  );
  const clientQuotes = useMemo(() => {
    if (!editingId) return [];
    const eventIds = new Set(events.filter((e) => e.clientId === editingId).map((e) => e.id));
    return quotes.filter((q) => eventIds.has(q.eventId));
  }, [quotes, events, editingId]);
  const clientMoney = useMemo(() => clientMoneyFromQuotes(clientQuotes), [clientQuotes]);
  const waUrl = whatsappPhoneUrl(form.phone);

  function reset() {
    setEditingId(null);
    setForm(blank);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        company: form.company || null,
        notes: form.notes || null,
      };
      if (editingId) await api.updateClient(editingId, payload);
      else await api.createClient(payload);
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
      await api.deleteClient(deleteId);
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
        title="Clientes"
        subtitle="Guarda quién contrata el servicio y cómo contactarlo."
      />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <h2>{editingId ? "Editar cliente" : "Nuevo cliente"}</h2>
          <FormField label="Nombre *">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. María López"
              required
            />
          </FormField>
          <div className="grid-2">
            <FormField label="Teléfono">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Empresa">
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </FormField>
          <FormField label="Notas">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </FormField>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear cliente"}
            </button>
            {waUrl ? (
              <a className="btn" href={waUrl} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            ) : null}
            {editingId ? (
              <>
                <Link className="btn" to={`/eventos/nuevo?cliente=${editingId}`}>
                  Nuevo evento
                </Link>
                <button className="btn ghost" type="button" onClick={reset}>
                  Cancelar
                </button>
              </>
            ) : null}
          </div>
          {editingId ? (
            <div>
              <h3 style={{ marginBottom: 8 }}>Historial</h3>
              <div className="stat-grid" style={{ marginBottom: 12 }}>
                <div className="stat">
                  <strong>{formatMoney(clientMoney.billed)}</strong>
                  <span>Facturado</span>
                </div>
                <div className="stat">
                  <strong>{formatMoney(clientMoney.paid)}</strong>
                  <span>Pagado</span>
                </div>
                <div className="stat">
                  <strong>{formatMoney(clientMoney.balance)}</strong>
                  <span>Saldo</span>
                </div>
              </div>
              {clientEvents.length > 0 ? (
                <>
                  <h3 style={{ marginBottom: 8 }}>Eventos</h3>
                  <div className="list">
                    {clientEvents.map((ev) => {
                      const money = clientMoneyFromQuotes(
                        clientQuotes.filter((q) => q.eventId === ev.id),
                      );
                      return (
                        <Link key={ev.id} to={`/eventos/${ev.id}`} className="list-item">
                          <div>
                            <h3>{ev.title}</h3>
                            <div className="meta">
                              {formatDate(ev.eventDate)} · {ev.attendees} personas
                              {money.billed > 0 ? ` · saldo ${formatMoney(money.balance)}` : ""}
                            </div>
                          </div>
                          <StatusBadge status={ev.status} />
                        </Link>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="meta">Aún no hay eventos de este cliente.</p>
              )}
              {clientQuotes.length > 0 ? (
                <>
                  <h3 style={{ margin: "16px 0 8px" }}>Cotizaciones</h3>
                  <div className="list">
                    {clientQuotes.map((q) => {
                      const money = quoteMoney(q);
                      return (
                        <Link key={q.id} to="/cotizaciones" className="list-item">
                          <div>
                            <h3>
                              {q.quoteNumber || `Cotización #${q.id}`} — {formatMoney(money.total)}
                            </h3>
                            <div className="meta">
                              {q.eventTitle}
                              {money.deposit > 0
                                ? ` · pagado ${formatMoney(money.deposit)} · saldo ${formatMoney(money.balance)}`
                                : ""}
                            </div>
                          </div>
                          <QuoteBadge status={q.status} />
                        </Link>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </form>

        <section className="panel">
          <h2>Listado</h2>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nombre, empresa o teléfono…"
          />
          {loading ? (
            <div className="loading">Cargando…</div>
          ) : visible.length === 0 ? (
            <EmptyState
              title="Aún no hay clientes"
              description="Crea el primero con el formulario de la izquierda."
            />
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {visible.map((c) => {
                const wa = whatsappPhoneUrl(c.phone ?? "");
                const eventIds = new Set(events.filter((e) => e.clientId === c.id).map((e) => e.id));
                const money = clientMoneyFromQuotes(quotes.filter((q) => eventIds.has(q.eventId)));
                return (
                <div key={c.id} className="list-item">
                  <div>
                    <h3>{c.name}</h3>
                    <div className="meta">
                      {[c.company, c.phone, c.email].filter(Boolean).join(" · ") || "Sin contacto"}
                      {money.billed > 0 ? ` · saldo ${formatMoney(money.balance)}` : ""}
                    </div>
                  </div>
                  <div className="page-actions">
                    {wa ? (
                      <a className="btn" href={wa} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    ) : null}
                    <button type="button" className="btn" onClick={() => startEdit(c)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => setDeleteId(c.id)}
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
        title="Eliminar cliente"
        message="Si el cliente tiene eventos, puede que no se pueda borrar. ¿Continuar?"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
