import { and, count, eq, gt } from "drizzle-orm";
import { db } from "../../../db";
import { teamSessions, teamUsers } from "../../../db/schema";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../../../shared/password";
import { error, now } from "./http";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
};

const SESSION_DAYS = 30;

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function publicUser(row: { id: number; email: string; name: string }): AuthUser {
  return { id: row.id, email: row.email, name: row.name };
}

export async function hasTeamUsers(): Promise<boolean> {
  const [row] = await db.select({ value: count() }).from(teamUsers);
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

export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  return null;
}
