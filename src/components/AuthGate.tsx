import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthUser } from "../api";
import { setSessionToken } from "../session";
import { seedDemoIfEmpty } from "../demoSeed";
import { FormField } from "./FormField";
import { normalizeRole } from "../../shared/roles";

function withRole(user: AuthUser): AuthUser {
  return { ...user, role: normalizeRole(user.role) };
}

type AuthContextValue = {
  user: AuthUser;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthGate");
  return ctx;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [configured, setConfigured] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recover, setRecover] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const status = await api.authStatus();
    setConfigured(status.configured);
    setHasRecovery(status.hasRecovery);
    setDemoAvailable(status.demoAvailable);
    setUser(status.user ? withRole(status.user) : null);
  }

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo verificar el acceso");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function logout() {
    try {
      await api.authLogout();
    } finally {
      setSessionToken(null);
      setUser(null);
      setConfigured(true);
      setRecover(false);
    }
  }

  async function onSetup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.authSetup({ name, email, password });
      setSessionToken(res.token);
      setUser(withRole(res.user));
      setConfigured(true);
      setHasRecovery(true);
      setRecoveryCode(res.recoveryCode);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el acceso");
    } finally {
      setSaving(false);
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.authLogin({ email, password });
      setSessionToken(res.token);
      setUser(withRole(res.user));
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setSaving(false);
    }
  }

  async function onRecover(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.authRecover({ email, code, password });
      setSessionToken(res.token);
      setUser(withRole(res.user));
      setPassword("");
      setCode("");
      setRecover(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo recuperar el acceso");
    } finally {
      setSaving(false);
    }
  }

  async function onDemo() {
    setSaving(true);
    setError("");
    try {
      const res = await api.authDemoLogin();
      setSessionToken(res.token);
      try {
        await seedDemoIfEmpty();
      } catch {
        /* el login sigue aunque falle el ejemplo */
      }
      setUser(withRole(res.user));
      setConfigured(true);
      setPassword("");
      setRecover(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar a la prueba");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <div className="loading">Cargando…</div>;

  if (user && recoveryCode) {
    return (
      <div className="pin-gate">
        <div className="panel pin-card form-grid">
          <h1>Guarda este código</h1>
          <p className="meta">
            Si olvidas la contraseña, entra con tu email y este código. No se envía por correo:
            anótalo en un lugar seguro.
          </p>
          <p className="recovery-code">{recoveryCode}</p>
          <button
            type="button"
            className="btn primary"
            style={{ width: "100%", marginTop: 12 }}
            onClick={() => setRecoveryCode(null)}
          >
            Ya lo guardé
          </button>
        </div>
      </div>
    );
  }

  if (user) {
    return <AuthContext.Provider value={{ user, refresh, logout }}>{children}</AuthContext.Provider>;
  }

  return (
    <div className="pin-gate">
      <form
        className="panel pin-card form-grid"
        onSubmit={configured ? (recover ? onRecover : onLogin) : onSetup}
      >
        <h1>CateringCRM</h1>
        <p className="meta">
          {!configured
            ? "Crea el primer acceso o entra a probar la plataforma sin contraseña."
            : recover
              ? hasRecovery
                ? "Usa el email de la cuenta y el código de recuperación del equipo."
                : "Aún no hay código de recuperación. Pide a alguien del equipo que genere uno en Ajustes."
              : "Entra con el email y la contraseña del equipo, o prueba sin clave."}
        </p>
        {demoAvailable && !recover ? (
          <>
            <button
              type="button"
              className="btn primary"
              style={{ width: "100%" }}
              disabled={saving}
              onClick={() => void onDemo()}
            >
              {saving ? "…" : "Probar sin contraseña"}
            </button>
            <p className="meta" style={{ textAlign: "center", margin: "4px 0 8px" }}>
              o {configured ? "entra con tu cuenta" : "crea el acceso del equipo"}
            </p>
          </>
        ) : null}
        {!configured ? (
          <FormField label="Nombre">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </FormField>
        ) : null}
        <FormField label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            autoFocus
          />
        </FormField>
        {configured && recover ? (
          <FormField label="Código de recuperación" hint="El del equipo, con o sin guiones.">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoComplete="one-time-code"
            />
          </FormField>
        ) : null}
        <FormField label={configured && recover ? "Nueva contraseña (mín. 8)" : "Contraseña (mín. 8)"}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={configured && !recover ? "current-password" : "new-password"}
          />
        </FormField>
        {error ? <p className="error-inline">{error}</p> : null}
        <button type="submit" className="btn" style={{ width: "100%", marginTop: 12 }} disabled={saving}>
          {saving ? "…" : !configured ? "Crear acceso" : recover ? "Restablecer y entrar" : "Entrar"}
        </button>
        {configured ? (
          <button
            type="button"
            className="btn ghost"
            style={{ width: "100%" }}
            onClick={() => {
              setRecover((v) => !v);
              setError("");
              setCode("");
            }}
          >
            {recover ? "Volver al login" : "Olvidé mi contraseña"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
