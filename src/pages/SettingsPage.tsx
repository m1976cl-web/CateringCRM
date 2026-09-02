import { useEffect, useRef, useState } from "react";
import { api, canClearAllData, getDataMode, getDataModeLabel, type AuthUser } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../components/AuthGate";
import { PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { loadCompanySettings, saveCompanySettings, type CompanySettings } from "../settings";

export function SettingsPage() {
  const mode = getDataMode();
  const { user } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(() => loadCompanySettings());
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [removeUser, setRemoveUser] = useState<AuthUser | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [hasRecovery, setHasRecovery] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [list, status] = await Promise.all([api.authListUsers(), api.authStatus()]);
        setUsers(list);
        setHasRecovery(status.hasRecovery);
      } catch {
        setUsers([user]);
      }
    })();
  }, [user]);

  function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    saveCompanySettings(settings);
    setMsg("Datos de empresa guardados.");
    setError("");
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.authAddUser({ name: newName, email: newEmail, password: newPassword });
      setUsers(await api.authListUsers());
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setMsg("Persona agregada al equipo.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.authChangePassword({ currentPassword, password: nextPassword });
      setCurrentPassword("");
      setNextPassword("");
      setMsg("Contraseña actualizada.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    }
  }

  async function removeTeammate() {
    if (!removeUser) return;
    try {
      await api.authDeleteUser(removeUser.id);
      setUsers(await api.authListUsers());
      setRemoveUser(null);
      setMsg("Persona quitada del equipo.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar");
    }
  }

  async function resetTeammate(e: React.FormEvent) {
    e.preventDefault();
    if (resetUserId == null) return;
    try {
      await api.authResetUserPassword({ userId: resetUserId, password: resetPassword });
      setResetUserId(null);
      setResetPassword("");
      setMsg("Contraseña restablecida. Esa persona debe entrar de nuevo.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer");
    }
  }

  async function issueRecovery() {
    try {
      const res = await api.authIssueRecoveryCode();
      setRecoveryCode(res.recoveryCode);
      setHasRecovery(true);
      setMsg("Código nuevo generado. El anterior deja de servir.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el código");
    }
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

  async function onClearAll() {
    if (!canClearAllData()) return;
    if (!window.confirm("¿Borrar todos los datos? Esta acción no se puede deshacer.")) return;
    try {
      await api.clearAll();
      setMsg("Todos los datos fueron borrados.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron borrar los datos");
    }
  }

  return (
    <div>
      <PageHeader
        title="Ajustes"
        subtitle="Empresa, acceso del equipo, nube y respaldos."
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
          <FormField
            label="IVA en cotizaciones"
            hint="En Chile el IVA general es 19%. Se suma al neto al imprimir y compartir."
          >
            <span className="inline-row" style={{ alignItems: "center" }}>
              <input
                type="checkbox"
                checked={settings.addIva}
                onChange={(e) => setSettings({ ...settings, addIva: e.target.checked })}
              />
              Agregar IVA al total
            </span>
          </FormField>
          {settings.addIva ? (
            <FormField label="Tasa IVA (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={settings.ivaRate}
                onChange={(e) =>
                  setSettings({ ...settings, ivaRate: Number(e.target.value) || 19 })
                }
              />
            </FormField>
          ) : null}
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

        <section className="panel form-grid">
          <h2>Equipo</h2>
          <p className="meta">
            Sesión de {user.name} ({user.email}). En modo servidor, las APIs rechazan peticiones sin
            login. En Supabase, las tablas del CRM y el acceso del equipo exigen esa sesión (RLS);
            la clave anónima ya no alcanza para leer datos. En modo local el login solo cierra la
            app de este dispositivo.
          </p>
          {users.length ? (
            <ul className="checklist">
              {users.map((u) => (
                <li key={u.id} className="inline-row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {u.name} · {u.email}
                    {u.id === user.id ? " (tú)" : ""}
                  </span>
                  {u.id !== user.id ? (
                    <span className="page-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setResetUserId(u.id);
                          setResetPassword("");
                        }}
                      >
                        Contraseña
                      </button>
                      <button type="button" className="btn danger" onClick={() => setRemoveUser(u)}>
                        Quitar
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {resetUserId != null ? (
            <form className="form-grid" onSubmit={(e) => void resetTeammate(e)}>
              <FormField
                label={`Nueva contraseña para ${users.find((u) => u.id === resetUserId)?.name ?? "la persona"}`}
              >
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </FormField>
              <div className="form-actions">
                <button type="submit" className="btn primary">
                  Restablecer
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setResetUserId(null);
                    setResetPassword("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}
          <form className="form-grid" onSubmit={(e) => void addUser(e)}>
            <FormField label="Nombre">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Contraseña (mín. 8)">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </FormField>
            <button type="submit" className="btn primary">
              Agregar persona
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Código de recuperación</h2>
          <p className="meta">
            {hasRecovery
              ? "El equipo ya tiene un código. Si lo perdiste, genera uno nuevo: el anterior deja de servir. En el login usa “Olvidé mi contraseña”."
              : "Aún no hay código. Genera uno y guárdalo: sirve para restablecer cualquier cuenta del equipo."}
          </p>
          {recoveryCode ? <p className="recovery-code">{recoveryCode}</p> : null}
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" onClick={() => void issueRecovery()}>
              {hasRecovery ? "Generar código nuevo" : "Generar código"}
            </button>
          </div>
        </section>

        <form className="panel form-grid" onSubmit={(e) => void changePassword(e)}>
          <h2>Cambiar mi contraseña</h2>
          <FormField label="Contraseña actual">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="Nueva contraseña">
            <input
              type="password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </FormField>
          <button type="submit" className="btn primary">
            Guardar contraseña
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
          ) : (
            <div className="form-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn danger" onClick={() => void onClearAll()}>
                Borrar todos los datos
              </button>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(removeUser)}
        title="Quitar del equipo"
        message={
          removeUser
            ? `¿Quitar a ${removeUser.name} (${removeUser.email})? Ya no podrá entrar.`
            : ""
        }
        confirmLabel="Quitar"
        onCancel={() => setRemoveUser(null)}
        onConfirm={() => void removeTeammate()}
      />
    </div>
  );
}
