import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { playerStats, users } from "@/db/schema";

const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

export interface AuthUser {
  id: string;
  username: string;
  isGuest: boolean;
}

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,16}$/, "Username must be 3-16 letters, numbers or underscores"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createToken(userId: string): string {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as { uid: string; exp: number };
    if (typeof uid !== "string" || typeof exp !== "number" || exp < Date.now()) return null;
    return uid;
  } catch {
    return null;
  }
}

export async function getUserByToken(token: string | undefined | null): Promise<AuthUser | null> {
  const uid = verifyToken(token);
  if (!uid) return null;
  const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!u) return null;
  return { id: u.id, username: u.username, isGuest: u.isGuest };
}

export async function getUserFromRequest(req: Request): Promise<AuthUser | null> {
  const h = req.headers.get("authorization") ?? "";
  return getUserByToken(h.startsWith("Bearer ") ? h.slice(7) : null);
}

async function createUser(username: string, password: string, isGuest: boolean): Promise<AuthUser> {
  const [u] = await db
    .insert(users)
    .values({ username, usernameLower: username.toLowerCase(), passwordHash: hashPassword(password), isGuest })
    .returning();
  await db.insert(playerStats).values({ userId: u.id }).onConflictDoNothing();
  return { id: u.id, username: u.username, isGuest: u.isGuest };
}

export async function registerUser(input: unknown): Promise<{ user: AuthUser; token: string }> {
  const { username, password } = credentialsSchema.parse(input);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, username.toLowerCase()));
  if (existing) throw new AuthError("That username is already taken", 409);
  const user = await createUser(username, password, false);
  return { user, token: createToken(user.id) };
}

export async function loginUser(input: unknown): Promise<{ user: AuthUser; token: string }> {
  const { username, password } = credentialsSchema.parse(input);
  const [u] = await db.select().from(users).where(eq(users.usernameLower, username.toLowerCase())).limit(1);
  if (!u || !verifyPassword(password, u.passwordHash)) throw new AuthError("Invalid username or password", 401);
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
  return { user: { id: u.id, username: u.username, isGuest: u.isGuest }, token: createToken(u.id) };
}

const ADJ = ["Swift", "Pixel", "Neon", "Turbo", "Lucky", "Cosmic", "Nimble", "Retro", "Fuzzy", "Brave"];
const NOUN = ["Fox", "Slime", "Knight", "Ghost", "Robot", "Comet", "Panda", "Wizard", "Frog", "Pilot"];

export async function createGuest(): Promise<{ user: AuthUser; token: string }> {
  for (let i = 0; i < 6; i++) {
    const name = `${ADJ[crypto.randomInt(ADJ.length)]}${NOUN[crypto.randomInt(NOUN.length)]}${crypto.randomInt(10, 99)}`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, name.toLowerCase()));
    if (existing) continue;
    const user = await createUser(name, crypto.randomBytes(12).toString("hex"), true);
    return { user, token: createToken(user.id) };
  }
  throw new AuthError("Could not create guest account", 500);
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
