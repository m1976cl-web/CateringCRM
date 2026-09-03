import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatDate, formatMoney } from "../api";
import type { PublicQuoteView } from "../publicQuote";
import { quoteTaxBreakdown, loadCompanySettings } from "../settings";
import { QUOTE_STATUS_LABELS } from "../../shared/types";

export function PublicQuotePage() {
  const rawToken = String(useParams().token ?? "");
  const token = decodeURIComponent(rawToken).trim();
  const [quote, setQuote] = useState<PublicQuoteView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const settings = loadCompanySettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.getPublicQuote(token);
        if (alive) setQuote(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo abrir la cotización");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const tax = useMemo(
    () => (quote ? quoteTaxBreakdown(quote.total, settings) : null),
    [quote, settings],
  );

  async function respond(action: "accept" | "reject") {
    setSaving(true);
    setError("");
    try {
      const next = await api.respondPublicQuote(token, action);
      setQuote(next);
      setMsg(action === "accept" ? "Cotización aceptada. Gracias." : "Quedó marcada como rechazada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo responder");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Cargando cotización…</div>;
  if (error && !quote) {
    return (
      <div className="pin-gate">
        <div className="panel pin-card">
          <h1>Enlace no válido</h1>
          <p className="meta">{error}</p>
        </div>
      </div>
    );
  }
  if (!quote || !tax) return null;

  const decided = quote.status === "aceptada" || quote.status === "rechazada";

  return (
    <div className="print-page" style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <header className="print-header">
        <div>
          <p className="print-company-meta">{settings.companyName || "CateringCRM"}</p>
          <h1 style={{ margin: "4px 0 0", fontFamily: "Fraunces, Georgia, serif" }}>
            Cotización {quote.quoteNumber || `#${quote.id}`}
          </h1>
          {quote.version > 1 ? <p className="meta">Versión {quote.version}</p> : null}
        </div>
        <div style={{ textAlign: "right" }}>
          <div>{QUOTE_STATUS_LABELS[quote.status]}</div>
          <div className="meta">{formatDate(quote.quoteDate)}</div>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}
      {msg ? <p className="meta">{msg}</p> : null}

      <section className="panel" style={{ marginTop: 16 }}>
        <p>
          <strong>{quote.clientName}</strong>
          {quote.clientCompany ? ` · ${quote.clientCompany}` : ""}
        </p>
        <p className="meta" style={{ margin: 0 }}>
          {quote.eventTitle} · {formatDate(quote.eventDate)} · {quote.attendees} personas
          {quote.location ? ` · ${quote.location}` : ""}
        </p>
      </section>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, i) => (
              <tr key={`${item.description}-${i}`}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.unitPrice)}</td>
                <td>{formatMoney(item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ textAlign: "right", marginTop: 12 }}>
        {tax.addIva ? (
          <>
            Neto {formatMoney(tax.net)} · IVA {tax.ivaRate}% {formatMoney(tax.iva)} ·{" "}
          </>
        ) : null}
        <strong>Total {formatMoney(tax.total)}</strong>
      </p>

      {quote.notes ? (
        <section style={{ marginTop: 16 }}>
          <h3>Notas</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{quote.notes}</p>
        </section>
      ) : null}

      {!decided ? (
        <div className="form-actions" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="btn primary"
            disabled={saving}
            onClick={() => void respond("accept")}
          >
            {saving ? "…" : "Aceptar cotización"}
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void respond("reject")}>
            Rechazar
          </button>
        </div>
      ) : (
        <p className="meta" style={{ marginTop: 24 }}>
          Esta cotización ya fue {quote.status === "aceptada" ? "aceptada" : "rechazada"}.
        </p>
      )}
    </div>
  );
}
