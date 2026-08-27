import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthUser } from "../api";
import { setSessionToken } from "../session";
import { FormField } from "./FormField";

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
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const status = await api.authStatus();
    setConfigured(status.configured);
    setUser(status.user);
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
    }
  }

  async function onSetup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.authSetup({ name, email, password });
      setSessionToken(res.token);
      setUser(res.user);
      setConfigured(true);
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
      setUser(res.user);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <div className="loading">Cargando…</div>;

  if (user) {
    return <AuthContext.Provider value={{ user, refresh, logout }}>{children}</AuthContext.Provider>;
  }

  return (
    <div className="pin-gate">
      <form className="panel pin-card form-grid" onSubmit={configured ? onLogin : onSetup}>
        <h1>CateringCRM</h1>
        <p className="meta">
          {configured
            ? "Entra con el email y la contraseña del equipo."
            : "Crea el primer acceso. Después la app pedirá login para leer y escribir datos."}
        </p>
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
        <FormField label="Contraseña (mín. 8)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={configured ? "current-password" : "new-password"}
          />
        </FormField>
        {error ? <p className="error-inline">{error}</p> : null}
        <button type="submit" className="btn primary" style={{ width: "100%", marginTop: 12 }} disabled={saving}>
          {saving ? "…" : configured ? "Entrar" : "Crear acceso"}
        </button>
      </form>
    </div>
  );
}
