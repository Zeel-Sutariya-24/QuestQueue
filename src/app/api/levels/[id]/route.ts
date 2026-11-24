import { respond } from "@/server/http";
import { getLevel } from "@/server/services/levels";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const level = await getLevel(id);
  if (!level) return Response.json({ error: "Level not found" }, { status: 404 });
  return respond(async () => ({ level }));
}
