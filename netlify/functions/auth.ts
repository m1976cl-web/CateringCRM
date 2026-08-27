import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { teamUsers } from "../../db/schema";
import { hashPassword } from "../../shared/password";
import {
  authenticate,
  createSession,
  createTeamUser,
  denyIfUnauthorized,
  destroySession,
  findUserByEmail,
  getSessionUser,
  hasTeamUsers,
  normalizeEmail,
  publicUser,
  validateNewPassword,
} from "./_shared/auth";
import { error, json, now, readJson } from "./_shared/http";

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  if (req.method === "GET" && action === "status") {
    const configured = await hasTeamUsers();
    const user = configured ? await getSessionUser(req) : null;
    return json({ configured, user });
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
    return json({ user, token: session.token }, 201);
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

  if (req.method === "POST" && action === "logout") {
    await destroySession(req);
    return json({ ok: true });
  }

  if (req.method === "POST" && action === "users") {
    const denied = await denyIfUnauthorized(req);
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
      .select({ id: teamUsers.id, email: teamUsers.email, name: teamUsers.name })
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
    const hashed = await hashPassword(next);
    await db
      .update(teamUsers)
      .set({
        passwordSalt: hashed.salt,
        passwordHash: hashed.hash,
        updatedAt: now(),
      })
      .where(eq(teamUsers.id, user.id));
    return json({ ok: true });
  }

  return error("Acción no válida", 404);
};

export const config: Config = {
  path: "/api/auth",
  method: ["GET", "POST", "PUT", "PATCH"],
};
