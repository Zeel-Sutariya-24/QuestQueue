import { respond } from "@/server/http";
import { getUserFromRequest } from "@/server/services/auth";
import { getProfile } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const viewer = await getUserFromRequest(req);
  const profile = await getProfile(decodeURIComponent(username), viewer?.id ?? null);
  if (!profile) return Response.json({ error: "Player not found" }, { status: 404 });
  return respond(async () => profile);
}
