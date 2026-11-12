import { describe, expect, it } from "vitest";
import { allServiceTypes, packRecipeCategory, recipeFitsService, unpackRecipeCategory } from "./recipeMeta";
import { SERVICE_TYPES, type ServiceType } from "./types";

describe("categoría empaquetada de la receta", () => {
  it("guarda servicios y texto libre, y los vuelve a separar", () => {
    const packed = packRecipeCategory("  Fondos  ", ["cena", "almuerzo", "cena"]);
    expect(packed).toBe("svc:cena,almuerzo|Fondos");
    expect(unpackRecipeCategory(packed)).toEqual({
      category: "Fondos",
      suitableServices: ["cena", "almuerzo"],
    });
  });

  it("sin servicios deja solo la categoría y sin categoría deja solo los servicios", () => {
    expect(packRecipeCategory("Fondos", [])).toBe("Fondos");
    expect(packRecipeCategory(null, ["desayuno"])).toBe("svc:desayuno");
    expect(packRecipeCategory("  ", [])).toBeNull();
  });

  it("si no se informan servicios, no reescribe un valor ya empaquetado", () => {
    expect(packRecipeCategory("  svc:almuerzo|Fondos  ", undefined)).toBe("svc:almuerzo|Fondos");
    expect(packRecipeCategory("Principal", null)).toBe("Principal");
  });

  it("al elegir servicios nuevos reemplaza los empaquetados y descarta los que no existen", () => {
    expect(packRecipeCategory("svc:almuerzo|Viejo", ["cena"])).toBe("svc:cena|Viejo");
    expect(packRecipeCategory("svc:almuerzo|Fondos", [])).toBe("Fondos");
    expect(packRecipeCategory("Postre", ["almuerzo", "no-es" as ServiceType])).toBe("svc:almuerzo|Postre");
  });

  it("desempaqueta texto plano y un prefijo sin categoría", () => {
    expect(unpackRecipeCategory("Fondos")).toEqual({ category: "Fondos", suitableServices: [] });
    expect(unpackRecipeCategory("svc:almuerzo")).toEqual({
      category: null,
      suitableServices: ["almuerzo"],
    });
    expect(unpackRecipeCategory("svc:nope,almuerzo|")).toEqual({
      category: null,
      suitableServices: ["almuerzo"],
    });
    expect(unpackRecipeCategory(null)).toEqual({ category: null, suitableServices: [] });
  });
});

describe("recipeFitsService", () => {
  it("sin marcas sirve para cualquier servicio", () => {
    expect(recipeFitsService(undefined, "cena")).toBe(true);
    expect(recipeFitsService(null, "cena")).toBe(true);
    expect(recipeFitsService([], "cena")).toBe(true);
  });

  it("con marcas solo calza las indicadas", () => {
    expect(recipeFitsService(["almuerzo"], "almuerzo")).toBe(true);
    expect(recipeFitsService(["almuerzo"], "cena")).toBe(false);
  });

  it("lista todos los tipos de servicio en una copia", () => {
    const services = allServiceTypes();
    expect(services).toEqual([...SERVICE_TYPES]);
    expect(services).not.toBe(SERVICE_TYPES);
  });
});
