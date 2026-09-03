import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, formatDateOnly, formatMoney, type QuoteSummary } from "../api";
import { PageHeader } from "../components/EmptyState";
import { QuoteBadge } from "../components/StatusBadge";
import { useAuth } from "../components/AuthGate";
import { canEditQuotes } from "../../shared/roles";
import { quoteMoney } from "../quoteDisplay";
import { loadCompanySettings } from "../settings";
import { whatsappPhoneUrl, whatsappTextUrl } from "../whatsapp";

function followUpText(q: QuoteSummary, balance: number): string {
  const due = q.dueDate ? formatDateOnly(q.dueDate) : null;
  return [
    `Hola ${q.clientName}, te escribo por el saldo de la cotización ${q.quoteNumber || `#${q.id}`} (${q.eventTitle}).`,
    `Saldo: ${formatMoney(balance)}`,
    due ? `Vence / evento: ${due}` : null,
    "¿Me confirmas el pago o si necesitas el enlace de nuevo?",
  ]
    .filter(Boolean)
    .join("\n");
}

export function CollectionsPage() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const settings = loadCompanySettings();

  async function load() {
    setLoading(true);
    try {
      setQuotes(await api.listQuotes());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar cobranza");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => {
    return quotes
      .map((q) => ({ q, money: quoteMoney(q, settings) }))
      .filter((row) => row.q.status !== "rechazada" && row.q.status !== "borrador" && row.money.balance > 0)
      .sort((a, b) => {
        const da = a.q.dueDate || a.q.quoteDate;
        const db = b.q.dueDate || b.q.quoteDate;
        return da.localeCompare(db);
      });
  }, [quotes, settings]);

  const overdue = rows.filter((row) => {
    const due = row.q.dueDate ? new Date(row.q.dueDate) : null;
    return due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
  });
  const total = rows.reduce((sum, row) => sum + row.money.balance, 0);

  async function markContacted(id: number) {
    const q = quotes.find((x) => x.id === id);
    if (!q) return;
    try {
      await api.updateQuote(id, {
        eventId: q.eventId,
        quoteNumber: q.quoteNumber,
        quoteDate: q.quoteDate,
        items: q.items,
        notes: q.notes,
        status: q.status,
        foodCost: q.foodCost,
        payments: q.payments,
        dueDate: q.dueDate,
        lastContactedAt: new Date().toISOString(),
      });
      setMsg("Marcado como contactado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  if (!canEditQuotes(user.role)) {
    return (
      <div className="empty">
        <h2>Cobranza</h2>
        <p>Tu rol no gestiona cobranzas.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Cobranza"
        subtitle="Cotizaciones enviadas o aceptadas con saldo. Llama, manda WhatsApp y marca el seguimiento."
      />
      {error ? <div className="error-box">{error}</div> : null}
      {msg ? <p className="meta">{msg}</p> : null}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat">
          <span className="meta">Por cobrar</span>
          <strong>{formatMoney(total)}</strong>
        </div>
        <div className="stat">
          <span className="meta">Pendientes</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="stat">
          <span className="meta">Vencidas</span>
          <strong>{overdue.length}</strong>
        </div>
      </div>

      {loading ? (
        <div className="loading">Cargando…</div>
      ) : rows.length === 0 ? (
        <section className="panel">
          <p className="meta" style={{ margin: 0 }}>
            No hay saldos pendientes. Cuando una cotización enviada o aceptada tenga saldo, aparece
            aquí.
          </p>
        </section>
      ) : (
        <div className="list">
          {rows.map(({ q, money }) => {
            const text = followUpText(q, money.balance);
            const wa = whatsappPhoneUrl(q.clientPhone ?? "", text) ?? whatsappTextUrl(text);
            const due = q.dueDate ? new Date(q.dueDate) : null;
            const isOverdue = Boolean(due && due.getTime() < Date.now());
            return (
              <div key={q.id} className="list-item">
                <div>
                  <h3>
                    {q.clientName} — {formatMoney(money.balance)}
                  </h3>
                  <div className="meta">
                    {q.quoteNumber || `Cotización #${q.id}`} · {q.eventTitle}
                    {q.dueDate ? ` · vence ${formatDateOnly(q.dueDate)}` : ""}
                    {q.lastContactedAt ? ` · último contacto ${formatDate(q.lastContactedAt)}` : ""}
                  </div>
                </div>
                <div className="page-actions">
                  <QuoteBadge status={q.status} />
                  {isOverdue ? <span className="badge tone-warn">Vencida</span> : null}
                  <a className="btn" href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                  <Link className="btn" to={`/cotizaciones?eventId=${q.eventId}`}>
                    Ver
                  </Link>
                  <button type="button" className="btn" onClick={() => void markContacted(q.id)}>
                    Contactado
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
