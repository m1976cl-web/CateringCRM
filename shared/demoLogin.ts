export const DEMO_USER_EMAIL = "demo@cateringcrm.app";
export const DEMO_USER_NAME = "Prueba";

/** Vacío o ausente = habilitado (para poder probar online). false/0/off/no lo apaga. */
export function parseDemoLoginFlag(raw: string | null | undefined): boolean {
  if (raw == null || raw.trim() === "") return true;
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

export function isDemoUserEmail(email: string | null | undefined): boolean {
  return normalizeDemoEmail(email) === DEMO_USER_EMAIL;
}

function normalizeDemoEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}
