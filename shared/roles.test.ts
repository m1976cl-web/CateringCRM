import { describe, expect, it } from "vitest";
import {
  TEAM_ROLE_LABELS,
  TEAM_ROLES,
  canDeleteCatalog,
  canEditClients,
  canEditPrices,
  canEditQuotes,
  canManageUsers,
  isTeamRole,
  normalizeRole,
  type TeamRole,
} from "./roles";

describe("roles de equipo", () => {
  it("expone las tres etiquetas en español", () => {
    expect(TEAM_ROLES).toEqual(["admin", "ventas", "cocina"]);
    expect(TEAM_ROLE_LABELS).toEqual({
      admin: "Administración",
      ventas: "Ventas",
      cocina: "Cocina / servicio",
    });
  });

  it.each([
    ["admin", true],
    ["ventas", true],
    ["cocina", true],
    ["Admin", false],
    ["", false],
    [null, false],
    [1, false],
  ] as const)("isTeamRole(%j) → %s", (value, expected) => {
    expect(isTeamRole(value)).toBe(expected);
  });

  it("un rol válido se conserva y cualquier otro valor queda como admin", () => {
    expect(normalizeRole("cocina")).toBe("cocina");
    expect(normalizeRole("ventas")).toBe("ventas");
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole(null)).toBe("admin");
    expect(normalizeRole("")).toBe("admin");
    expect(normalizeRole("invitado")).toBe("admin");
  });

  it.each([
    ["admin", true, true, true, true, true],
    ["ventas", false, true, false, true, true],
    ["cocina", false, false, false, false, false],
  ] as const)(
    "permisos de %s",
    (role: TeamRole, users, quotes, catalog, prices, clients) => {
      expect(canManageUsers(role)).toBe(users);
      expect(canEditQuotes(role)).toBe(quotes);
      expect(canDeleteCatalog(role)).toBe(catalog);
      expect(canEditPrices(role)).toBe(prices);
      expect(canEditClients(role)).toBe(clients);
    },
  );
});
