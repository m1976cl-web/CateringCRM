import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { teamUsers } from "../../db/schema";
import {
  authenticate,
  countTeamUsers,
  createSession,
  createTeamUser,
  denyIfCannot,
  denyIfUnauthorized,
  destroySession,
  destroyUserSessions,
  findUserByEmail,
  getSessionUser,
  hasNonDemoUsers,
  hasRecoveryCode,
  hasTeamUsers,
  isDemoLoginEnabled,
  loginDemo,
  normalizeEmail,
  publicUser,
  replaceRecoveryCode,
  setUserPassword,
  setUserRole,
  validateNewPassword,
  verifyRecoveryCode,
} from "./_shared/auth";
import { canManageUsers, isTeamRole } from "../../shared/roles";
import { error, json, readJson } from "./_shared/http";

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  if (req.method === "GET" && action === "status") {
    const configured = await hasTeamUsers();
    const user = configured ? await getSessionUser(req) : null;
    return json({
      configured,
      user,
      hasRecovery: await hasRecoveryCode(),
      demoAvailable: isDemoLoginEnabled() && !(await hasNonDemoUsers()),
    });
  }

  if (req.method === "GET" && action === "me") {
    const denied = await denyIfUnauthorized(req);
    if (denied) return denied;
    const user = await getSessionUser(req);
    if (!user) return error("Inicia sesión para continuar", 401);
    return json({ user });
  }

  if (req.method === "POST" && action === "setup") {
    if (await hasTeamUsers()) return error("El acceso del equipo ya está creado", 409);
    const body = await readJson(req);
    const name = String(body.name ?? "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!name) return error("El nombre es obligatorio");
    if (!email || !email.includes("@")) return error("Indica un email válido");
    const pwdErr = validateNewPassword(password);
    if (pwdErr) return error(pwdErr);
    const user = await createTeamUser({ name, email, password });
    const session = await createSession(user.id);
    const recoveryCode = await replaceRecoveryCode();
    return json({ user, token: session.token, recoveryCode }, 201);
  }

  if (req.method === "POST" && action === "login") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const user = await authenticate(email, password);
    if (!user) return error("Email o contraseña incorrectos", 401);
    const session = await createSession(user.id);
    return json({ user, token: session.token });
  }

  if (req.method === "POST" && action === "demo") {
    if (!isDemoLoginEnabled()) return error("El acceso de prueba está desactivado", 403);
    const demo = await loginDemo();
    return json(demo);
  }

  if (req.method === "POST" && action === "logout") {
    await destroySession(req);
    return json({ ok: true });
  }

  if (req.method === "POST" && action === "users") {
    const denied = await denyIfCannot(req, canManageUsers);
    if (denied) return denied;
    const body = await readJson(req);
    const name = String(body.name ?? "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!name) return error("El nombre es obligatorio");
    if (!email || !email.includes("@")) return error("Indica un email válido");
    const pwdErr = validateNewPassword(password);
    if (pwdErr) return error(pwdErr);
    if (await findUserByEmail(email)) return error("Ese email ya tiene acceso");
    const user = await createTeamUser({ name, email, password });
    return json({ user }, 201);
  }

  if (req.method === "GET" && action === "users") {
    const denied = await denyIfUnauthorized(req);
    if (denied) return denied;
    const rows = await db
      .select({ id: teamUsers.id, email: teamUsers.email, name: teamUsers.name, role: teamUsers.role })
      .from(teamUsers);
    return json(rows.map(publicUser));
  }

  if ((req.method === "PUT" || req.method === "PATCH") && action === "password") {
    const denied = await denyIfUnauthorized(req);
    if (denied) return denied;
    const user = await getSessionUser(req);
    if (!user) return error("Inicia sesión para continuar", 401);
    const body = await readJson(req);
    const current = String(body.currentPassword ?? "");
    const next = String(body.password ?? "");
    const pwdErr = validateNewPassword(next);
    if (pwdErr) return error(pwdErr);
    const ok = await authenticate(user.email, current);
    if (!ok) return error("La contraseña actual no es correcta", 401);
    await setUserPassword(user.id, next);
    return json({ ok: true });
  }

  if (req.method === "POST" && action === "recovery-code") {
    const denied = await denyIfUnauthorized(req);
    if (denied) return denied;
    const recoveryCode = await replaceRecoveryCode();
    return json({ recoveryCode });
  }

  if (req.method === "POST" && action === "recover") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code ?? "");
    const password = String(body.password ?? "");
    const pwdErr = validateNewPassword(password);
    if (pwdErr) return error(pwdErr);
    const row = await findUserByEmail(email);
    const codeOk = await verifyRecoveryCode(code);
    if (!row || !codeOk) return error("Email o código incorrectos", 401);
    await setUserPassword(row.id, password);
    await destroyUserSessions(row.id);
    const session = await createSession(row.id);
    return json({ user: publicUser(row), token: session.token });
  }

  if ((req.method === "PUT" || req.method === "PATCH") && action === "reset-password") {
    const denied = await denyIfUnauthorized(req);
    if (denied) return denied;
    const actor = await getSessionUser(req);
    if (!actor) return error("Inicia sesión para continuar", 401);
    const body = await readJson(req);
    const userId = Number(body.userId ?? body.user_id);
    const password = String(body.password ?? "");
    if (!Number.isInteger(userId) || userId <= 0) return error("Usuario no válido");
    if (userId === actor.id) return error("Para tu contraseña usa Cambiar mi contraseña");
    const pwdErr = validateNewPassword(password);
    if (pwdErr) return error(pwdErr);
    const [target] = await db.select().from(teamUsers).where(eq(teamUsers.id, userId)).limit(1);
    if (!target) return error("Usuario no encontrado", 404);
    await setUserPassword(target.id, password);
    await destroyUserSessions(target.id);
    return json({ ok: true });
  }

  if (req.method === "DELETE" && action === "users") {
    const denied = await denyIfCannot(req, canManageUsers);
    if (denied) return denied;
    const actor = await getSessionUser(req);
    if (!actor) return error("Inicia sesión para continuar", 401);
    const userId = Number(url.searchParams.get("id"));
    if (!Number.isInteger(userId) || userId <= 0) return error("Usuario no válido");
    if (userId === actor.id) return error("No puedes quitarte a ti mismo");
    if ((await countTeamUsers()) <= 1) return error("Debe quedar al menos una persona con acceso");
    const [target] = await db.select({ id: teamUsers.id }).from(teamUsers).where(eq(teamUsers.id, userId)).limit(1);
    if (!target) return error("Usuario no encontrado", 404);
    await db.delete(teamUsers).where(eq(teamUsers.id, userId));
    return json({ ok: true });
  }

  if ((req.method === "PUT" || req.method === "PATCH") && action === "role") {
    const denied = await denyIfCannot(req, canManageUsers);
    if (denied) return denied;
    const actor = await getSessionUser(req);
    if (!actor) return error("Inicia sesión para continuar", 401);
    const body = await readJson(req);
    const userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId <= 0) return error("Usuario no válido");
    if (userId === actor.id) return error("No puedes cambiar tu propio rol");
    if (!isTeamRole(body.role)) return error("Rol no válido");
    const user = await setUserRole(userId, body.role);
    if (!user) return error("Usuario no encontrado", 404);
    return json({ user });
  }

  return error("Acción no válida", 404);
};

export const config: Config = {
  path: "/api/auth",
  method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
};
