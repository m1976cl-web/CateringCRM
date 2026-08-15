import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, isSameCalendarDay, toDateInput, type EventSummary } from "../api";
import { PageHeader } from "../components/EmptyState";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await api.listEvents();
        if (alive) setEvents(rows);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const result: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < total; i++) {
      if (i < startOffset) {
        result.push({
          date: new Date(year, month - 1, prevDays - startOffset + i + 1),
          inMonth: false,
        });
      } else if (i >= startOffset + daysInMonth) {
        result.push({
          date: new Date(year, month + 1, i - startOffset - daysInMonth + 1),
          inMonth: false,
        });
      } else {
        result.push({
          date: new Date(year, month, i - startOffset + 1),
          inMonth: true,
        });
      }
    }
    return result;
  }, [cursor]);

  function eventsOn(day: Date) {
    return events.filter((ev) => {
      const d = new Date(ev.eventDate);
      return (
        d.getFullYear() === day.getFullYear() &&
        d.getMonth() === day.getMonth() &&
        d.getDate() === day.getDate()
      );
    });
  }

  const title = cursor.toLocaleDateString("es", { month: "long", year: "numeric" });

  return (
    <div>
      <PageHeader
        title="Calendario"
        subtitle="Vista mensual. Toca “+ evento” en un día para crear uno."
        actions={
          <div className="page-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              ← Mes anterior
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCursor(startOfMonth(new Date()))}
            >
              Hoy
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              Mes siguiente →
            </button>
          </div>
        }
      />

      <h2 style={{ textTransform: "capitalize", marginTop: 0 }}>{title}</h2>
      {error ? <div className="error-box">{error}</div> : null}
      {loading ? (
        <div className="loading">Cargando…</div>
      ) : (
        <div className="calendar">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-head">
              {d}
            </div>
          ))}
          {cells.map(({ date, inMonth }) => {
            const dayEvents = eventsOn(date);
            const today = isSameCalendarDay(date);
            return (
              <div
                key={date.toISOString()}
                className={`cal-day ${inMonth ? "" : "muted"} ${today ? "today" : ""}`}
              >
                <strong>{date.getDate()}</strong>
                {dayEvents.map((ev) => (
                  <Link key={ev.id} className="cal-event" to={`/eventos/${ev.id}`} title={formatDate(ev.eventDate)}>
                    {ev.title}
                  </Link>
                ))}
                {inMonth ? (
                  <Link className="cal-day-add" to={`/eventos/nuevo?fecha=${toDateInput(date)}`}>
                    + evento
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
