import {
  SERVICE_TYPES,
  isServiceType,
  type ServiceType,
} from "./types";

const SVC_PREFIX = "svc:";

/**
 * Empaqueta servicios aptos + categoría libre en el campo category (sin migración).
 * Si `suitableServices` es null/undefined, no reescribe un valor ya empaquetado.
 */
export function packRecipeCategory(
  category: string | null | undefined,
  suitableServices: ServiceType[] | null | undefined,
): string | null {
  if (suitableServices === undefined || suitableServices === null) {
    return category?.trim() || null;
  }

  const free = category?.startsWith(SVC_PREFIX)
    ? unpackRecipeCategory(category).category
    : category?.trim() || null;
  const services = [...new Set(suitableServices.filter(isServiceType))];
  const svc = services.length ? `${SVC_PREFIX}${services.join(",")}` : "";
  if (svc && free) return `${svc}|${free}`;
  return svc || free || null;
}

export function unpackRecipeCategory(raw: string | null | undefined): {
  category: string | null;
  suitableServices: ServiceType[];
} {
  if (!raw) return { category: null, suitableServices: [] };
  if (!raw.startsWith(SVC_PREFIX)) {
    return { category: raw, suitableServices: [] };
  }
  const pipe = raw.indexOf("|");
  const svcPart = pipe >= 0 ? raw.slice(SVC_PREFIX.length, pipe) : raw.slice(SVC_PREFIX.length);
  const category = pipe >= 0 ? raw.slice(pipe + 1).trim() || null : null;
  const suitableServices = svcPart
    .split(",")
    .map((s) => s.trim())
    .filter(isServiceType);
  return { category, suitableServices };
}

/** Si no hay tags, la receta sirve para cualquier servicio. */
export function recipeFitsService(
  suitableServices: ServiceType[] | null | undefined,
  service: ServiceType,
): boolean {
  if (!suitableServices || suitableServices.length === 0) return true;
  return suitableServices.includes(service);
}

export function allServiceTypes(): ServiceType[] {
  return [...SERVICE_TYPES];
}
