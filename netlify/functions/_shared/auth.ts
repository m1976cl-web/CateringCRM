import { and, count, eq, gt, ne } from "drizzle-orm";
import { db } from "../../../db";
import { teamRecovery, teamSessions, teamUsers } from "../../../db/schema";
import {
  hashPassword,
  normalizeRecoveryCode,
  randomRecoveryCode,
  randomToken,
  sha256Hex,
  verifyPassword,
} from "../../../shared/password";
import { DEMO_USER_EMAIL, DEMO_USER_NAME, parseDemoLoginFlag } from "../../../shared/demoLogin";
import { normalizeRole, type TeamRole } from "../../../shared/roles";
import { error, now } from "./http";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: TeamRole;
};

const SESSION_DAYS = 30;

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function publicUser(row: { id: number; email: string; name: string; role?: string | null }): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: normalizeRole(row.role) };
}

export async function hasTeamUsers(): Promise<boolean> {
  const [row] = await db.select({ value: count() }).from(teamUsers);
  return (row?.value ?? 0) > 0;
}

export async function hasNonDemoUsers(): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(teamUsers)
    .where(ne(teamUsers.email, DEMO_USER_EMAIL));
  return (row?.value ?? 0) > 0;
}

export async function readBearer(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getSessionUser(req: Request): Promise<AuthUser | null> {
  const token = await readBearer(req);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const [row] = await db
    .select({
      id: teamUsers.id,
      email: teamUsers.email,
      name: teamUsers.name,
      role: teamUsers.role,
      expiresAt: teamSessions.expiresAt,
    })
    .from(teamSessions)
    .innerJoin(teamUsers, eq(teamSessions.userId, teamUsers.id))
    .where(and(eq(teamSessions.tokenHash, tokenHash), gt(teamSessions.expiresAt, now())))
    .limit(1);
  return row ? publicUser(row) : null;
}

export async function denyIfUnauthorized(req: Request): Promise<Response | null> {
  if (!(await hasTeamUsers())) return null;
  const user = await getSessionUser(req);
  if (user) return null;
  return error("Inicia sesión para continuar", 401);
}

export async function denyIfCannot(
  req: Request,
  allowed: (role: TeamRole) => boolean,
): Promise<Response | null> {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;
  if (!(await hasTeamUsers())) return null;
  const user = await getSessionUser(req);
  if (!user) return error("Inicia sesión para continuar", 401);
  if (!allowed(user.role)) return error("No tienes permiso para esta acción", 403);
  return null;
}

export async function setUserRole(userId: number, role: TeamRole): Promise<AuthUser | null> {
  const [updated] = await db
    .update(teamUsers)
    .set({ role: normalizeRole(role), updatedAt: now() })
    .where(eq(teamUsers.id, userId))
    .returning();
  return updated ? publicUser(updated) : null;
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(teamSessions).values({
    userId,
    tokenHash,
    expiresAt,
    createdAt: now(),
  });
  return { token, expiresAt };
}

export async function destroySession(req: Request): Promise<void> {
  const token = await readBearer(req);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await db.delete(teamSessions).where(eq(teamSessions.tokenHash, tokenHash));
}

export async function createTeamUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const hashed = await hashPassword(input.password);
  const [row] = await db
    .insert(teamUsers)
    .values({
      name: input.name,
      email: input.email,
      passwordSalt: hashed.salt,
      passwordHash: hashed.hash,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  return publicUser(row);
}

export async function findUserByEmail(email: string) {
  const [row] = await db.select().from(teamUsers).where(eq(teamUsers.email, email)).limit(1);
  return row ?? null;
}

export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
  const row = await findUserByEmail(email);
  if (!row) return null;
  const ok = await verifyPassword(password, row.passwordSalt, row.passwordHash);
  return ok ? publicUser(row) : null;
}

export function isDemoLoginEnabled(): boolean {
  const netlify = (globalThis as { Netlify?: { env: { get: (name: string) => string | undefined } } })
    .Netlify;
  const raw = netlify?.env.get("DEMO_LOGIN") ?? netlify?.env.get("VITE_DEMO_LOGIN");
  return parseDemoLoginFlag(raw);
}

export async function loginDemo(): Promise<{ user: AuthUser; token: string }> {
  let row = await findUserByEmail(DEMO_USER_EMAIL);
  if (!row) {
    const user = await createTeamUser({
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
      password: randomToken(),
    });
    const session = await createSession(user.id);
    return { user, token: session.token };
  }
  const session = await createSession(row.id);
  return { user: publicUser(row), token: session.token };
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  return null;
}

export async function countTeamUsers(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(teamUsers);
  return row?.value ?? 0;
}

export async function hasRecoveryCode(): Promise<boolean> {
  const [row] = await db.select({ id: teamRecovery.id }).from(teamRecovery).limit(1);
  return Boolean(row);
}

export async function replaceRecoveryCode(): Promise<string> {
  const code = randomRecoveryCode();
  const hashed = await hashPassword(normalizeRecoveryCode(code));
  await db.delete(teamRecovery);
  await db.insert(teamRecovery).values({
    codeSalt: hashed.salt,
    codeHash: hashed.hash,
    createdAt: now(),
  });
  return code;
}

export async function verifyRecoveryCode(code: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return false;
  const [row] = await db.select().from(teamRecovery).limit(1);
  if (!row) return false;
  return verifyPassword(normalized, row.codeSalt, row.codeHash);
}

export async function destroyUserSessions(userId: number): Promise<void> {
  await db.delete(teamSessions).where(eq(teamSessions.userId, userId));
}

export async function setUserPassword(userId: number, password: string): Promise<void> {
  const hashed = await hashPassword(password);
  await db
    .update(teamUsers)
    .set({
      passwordSalt: hashed.salt,
      passwordHash: hashed.hash,
      updatedAt: now(),
    })
    .where(eq(teamUsers.id, userId));
}
