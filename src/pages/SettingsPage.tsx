import { useRef, useState } from "react";
import { api, canClearAllData, getDataMode, getDataModeLabel } from "../api";
import { PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import {
  getStoredPin,
  loadCompanySettings,
  saveCompanySettings,
  setStoredPin,
  type CompanySettings,
} from "../settings";

export function SettingsPage() {
  const mode = getDataMode();
  const [settings, setSettings] = useState<CompanySettings>(() => loadCompanySettings());
  const [pin, setPin] = useState(getStoredPin() ?? "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    saveCompanySettings(settings);
    setMsg("Datos de empresa guardados.");
    setError("");
  }

  function savePin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pin.trim();
    if (trimmed && trimmed.length < 4) {
      setError("El PIN debe tener al menos 4 caracteres, o déjalo vacío para quitarlo.");
      return;
    }
    setStoredPin(trimmed || null);
    setMsg(trimmed ? "PIN activado. Se pedirá al abrir la app." : "PIN desactivado.");
    setError("");
  }

  function exportBackup() {
    try {
      const json = api.exportLocalBackup();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cateringcrm-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Respaldo descargado (copia local de este dispositivo).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    }
  }

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      api.importLocalBackup(text);
      setMsg("Respaldo importado en el almacenamiento local.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    }
  }

  return (
    <div>
      <PageHeader
        title="Ajustes"
        subtitle="Empresa, PIN de acceso, nube y respaldos."
      />
      {error ? <div className="error-box">{error}</div> : null}
      {msg ? <p className="meta">{msg}</p> : null}

      <div className="stack">
        <section className="panel">
          <h2>Almacenamiento</h2>
          <p>
            Modo actual: <strong>{getDataModeLabel(mode)}</strong>
          </p>
          {mode === "static" ? (
            <div className="banner banner-warn" style={{ marginTop: 12 }}>
              <p style={{ margin: "0 0 8px" }}>
                En GitHub Pages sin nube, cada celular guarda sus propios datos. Para compartir:
              </p>
              <ol className="checklist">
                <li>Crea un proyecto gratis en supabase.com</li>
                <li>Ejecuta el SQL de <code>supabase/migrations/</code> en el SQL Editor</li>
                <li>
                  En GitHub → Settings → Secrets: <code>VITE_SUPABASE_URL</code> y{" "}
                  <code>VITE_SUPABASE_ANON_KEY</code>
                </li>
                <li>Vuelve a publicar Pages (push a main)</li>
              </ol>
              <p className="meta" style={{ marginBottom: 0 }}>
                Detalle completo en el README del repositorio.
              </p>
            </div>
          ) : mode === "supabase" ? (
            <p className="meta">Los datos se sincronizan en la nube entre dispositivos.</p>
          ) : (
            <p className="meta">Usando el servidor Netlify / base Postgres.</p>
          )}
        </section>

        <form className="panel form-grid" onSubmit={saveCompany}>
          <h2>Datos para cotizaciones</h2>
          <FormField label="Nombre de la empresa">
            <input
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
            />
          </FormField>
          <div className="grid-2">
            <FormField label="Teléfono">
              <input
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Dirección">
            <input
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
            />
          </FormField>
          <FormField label="Validez de cotización (días)">
            <input
              type="number"
              min={1}
              value={settings.quoteValidityDays}
              onChange={(e) =>
                setSettings({ ...settings, quoteValidityDays: Number(e.target.value) || 15 })
              }
            />
          </FormField>
          <FormField label="Texto fijo / condiciones">
            <textarea
              value={settings.quoteNotes}
              onChange={(e) => setSettings({ ...settings, quoteNotes: e.target.value })}
            />
          </FormField>
          <button type="submit" className="btn primary">
            Guardar empresa
          </button>
        </form>

        <form className="panel form-grid" onSubmit={savePin}>
          <h2>PIN de acceso (opcional)</h2>
          <p className="meta">
            Si defines un PIN, la app lo pedirá al abrir (en este navegador). No reemplaza un login
            completo.
          </p>
          <FormField label="PIN (mín. 4 caracteres, vacío = sin PIN)">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          <button type="submit" className="btn primary">
            Guardar PIN
          </button>
        </form>

        <section className="panel">
          <h2>Respaldo local</h2>
          <p className="meta">
            Exporta o importa un JSON del almacenamiento local (útil si no usas nube).
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={exportBackup}>
              Exportar JSON
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Importar JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {!canClearAllData() ? (
            <p className="meta" style={{ marginTop: 12 }}>
              En modo servidor, el borrado masivo no está disponible desde la app.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
