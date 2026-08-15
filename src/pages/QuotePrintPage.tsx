import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatDate, formatMoney, type QuoteDetail } from "../api";
import { loadCompanySettings, quoteTaxBreakdown } from "../settings";
import { QUOTE_STATUS_LABELS } from "../../shared/types";

export function QuotePrintPage() {
  const { id } = useParams();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [error, setError] = useState("");
  const settings = loadCompanySettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.getQuote(Number(id));
        if (alive) setQuote(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <div className="error-box" style={{ margin: 24 }}>{error}</div>;
  if (!quote) return <div className="loading">Cargando cotización…</div>;

  const validUntil = new Date(quote.quoteDate);
  validUntil.setDate(validUntil.getDate() + (settings.quoteValidityDays || 15));
  const tax = quoteTaxBreakdown(quote.total, settings);

  return (
    <div className="print-page">
      <div className="print-actions">
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Imprimir / Guardar PDF
        </button>
        <Link className="btn" to="/cotizaciones">
          Volver
        </Link>
      </div>

      <header className="print-header">
        <div>
          <h1 style={{ margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
            {settings.companyName || "Cotización"}
          </h1>
          <p className="print-company-meta">
            {[settings.phone, settings.email, settings.address].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div>
            <strong>{quote.quoteNumber || `#${quote.id}`}</strong>
          </div>
          <div>{formatDate(quote.quoteDate)}</div>
          <div>Válida hasta {validUntil.toLocaleDateString("es-CL")}</div>
          <div>{QUOTE_STATUS_LABELS[quote.status]}</div>
        </div>
      </header>

      <section style={{ marginTop: 28 }}>
        <h3 style={{ marginBottom: 6 }}>Cliente</h3>
        <div>{quote.clientName}</div>
        {quote.clientCompany ? <div>{quote.clientCompany}</div> : null}
        {quote.clientPhone ? <div>{quote.clientPhone}</div> : null}
        {quote.clientEmail ? <div>{quote.clientEmail}</div> : null}
      </section>

      <section style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 6 }}>Evento</h3>
        <div>{quote.eventTitle}</div>
        <div>{formatDate(quote.eventDate)}</div>
        <div>{quote.attendees} asistentes</div>
        {quote.location ? <div>{quote.location}</div> : null}
      </section>

      <table className="data" style={{ marginTop: 28 }}>
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Cant.</th>
            <th>Precio</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, idx) => (
            <tr key={idx}>
              <td>{item.description}</td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.unitPrice)}</td>
              <td>{formatMoney(item.quantity * item.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {tax.addIva ? (
        <div className="quote-totals">
          <span>Neto: {formatMoney(tax.net)}</span>
          <span>
            IVA {tax.ivaRate}%: {formatMoney(tax.iva)}
          </span>
          <p style={{ textAlign: "right", fontSize: "1.25rem", margin: 0 }}>
            <strong>Total: {formatMoney(tax.total)}</strong>
          </p>
        </div>
      ) : (
        <p style={{ textAlign: "right", fontSize: "1.25rem", marginTop: 16 }}>
          <strong>Total: {formatMoney(quote.total)}</strong>
        </p>
      )}

      {quote.notes ? (
        <section style={{ marginTop: 24 }}>
          <h3>Notas</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{quote.notes}</p>
        </section>
      ) : null}

      {settings.quoteNotes ? (
        <section className="print-terms">
          <h3>Condiciones</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{settings.quoteNotes}</p>
        </section>
      ) : null}
    </div>
  );
}
