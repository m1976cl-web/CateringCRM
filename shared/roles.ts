export const TEAM_ROLES = ["admin", "ventas", "cocina"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Administración",
  ventas: "Ventas",
  cocina: "Cocina / servicio",
};

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): TeamRole {
  return isTeamRole(value) ? value : "admin";
}

export function canManageUsers(role: TeamRole): boolean {
  return role === "admin";
}

export function canEditQuotes(role: TeamRole): boolean {
  return role !== "cocina";
}

export function canDeleteCatalog(role: TeamRole): boolean {
  return role === "admin";
}

export function canEditPrices(role: TeamRole): boolean {
  return role !== "cocina";
}

export function canEditClients(role: TeamRole): boolean {
  return role !== "cocina";
}
