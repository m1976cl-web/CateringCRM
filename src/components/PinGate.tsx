import { useState, type ReactNode } from "react";
import { getStoredPin, isPinUnlocked, unlockPin } from "../settings";

export function PinGate({ children }: { children: ReactNode }) {
  const needsPin = Boolean(getStoredPin()) && !isPinUnlocked();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(!needsPin);

  if (unlocked) return <>{children}</>;

  return (
    <div className="pin-gate">
      <form
        className="panel pin-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (unlockPin(pin)) {
            setUnlocked(true);
            setError("");
          } else {
            setError("PIN incorrecto");
          }
        }}
      >
        <h1>CateringCRM</h1>
        <p className="meta">Ingresa el PIN para continuar</p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
          inputMode="numeric"
          className="pin-input"
        />
        {error ? <p className="error-inline">{error}</p> : null}
        <button type="submit" className="btn primary" style={{ width: "100%", marginTop: 12 }}>
          Entrar
        </button>
      </form>
    </div>
  );
}
