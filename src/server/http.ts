import { ZodError } from "zod";
import { AuthError } from "./services/auth";
import { RateLimiter } from "./rateLimit";

const authLimiter = new RateLimiter(20, 60_000);

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function limitAuth(req: Request) {
  if (!authLimiter.allow(clientIp(req))) throw new AuthError("Too many attempts. Please wait a minute.", 429);
}

/** Wraps a route handler with consistent JSON error responses. */
export async function respond(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: e.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api] unhandled error", e);
    return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}
