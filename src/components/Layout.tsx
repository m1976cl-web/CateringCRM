import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { getDataMode, getDataModeLabel } from "../api";
import { onOfflineFallback, resetOfflineFallbackFlag } from "../offlineBanner";
import { InstallButton } from "./InstallButton";

const operationLinks = [
  { to: "/", label: "Inicio", end: true },
  { to: "/eventos", label: "Eventos" },
  { to: "/calendario", label: "Calendario" },
  { to: "/compras", label: "Compras" },
  { to: "/cotizaciones", label: "Cotizaciones" },
];

const catalogLinks = [
  { to: "/clientes", label: "Clientes" },
  { to: "/recetas", label: "Recetas" },
  { to: "/ingredientes", label: "Ingredientes" },
  { to: "/proveedores", label: "Proveedores" },
  { to: "/ajustes", label: "Ajustes" },
];

const modeTone: Record<string, string> = {
  supabase: "tone-good",
  netlify: "tone-info",
  static: "tone-neutral",
};

export function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [offlineBanner, setOfflineBanner] = useState(false);
  const location = useLocation();
  const mode = getDataMode();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    return onOfflineFallback(() => setOfflineBanner(true));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-row">
          <NavLink to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              ◈
            </span>
            <span>
              Catering<em>CRM</em>
            </span>
          </NavLink>
          <div className="topbar-actions">
            <span
              className={`badge mode-badge ${modeTone[mode] ?? "tone-neutral"}`}
              title="Dónde se guardan los datos"
            >
              {getDataModeLabel(mode)}
            </span>
            <InstallButton />
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="sr-only">{menuOpen ? "Cerrar menú" : "Abrir menú"}</span>
              <span aria-hidden className={menuOpen ? "nav-toggle-bars open" : "nav-toggle-bars"}>
                <i />
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
        <nav
          id="main-nav"
          className={menuOpen ? "nav nav-open" : "nav"}
          aria-label="Principal"
        >
          <div className="nav-group">
            <span className="nav-group-label">Operación</span>
            {operationLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="nav-group">
            <span className="nav-group-label">Catálogo</span>
            {catalogLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {mode === "static" ? (
        <div className="banner banner-warn" role="status">
          Los datos no se comparten entre celulares. Conectá la nube en Ajustes para el equipo.
        </div>
      ) : null}

      {offlineBanner ? (
        <div className="banner banner-danger" role="alert">
          No se pudo conectar al servidor; guardando solo en este dispositivo.{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => {
              resetOfflineFallbackFlag();
              setOfflineBanner(false);
            }}
          >
            Entendido
          </button>
        </div>
      ) : null}

      <main className="main">{children}</main>
    </div>
  );
}
