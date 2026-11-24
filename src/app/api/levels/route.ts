import { respond } from "@/server/http";
import { getUserFromRequest } from "@/server/services/auth";
import { listLevels, type LevelSort } from "@/server/services/levels";

export const dynamic = "force-dynamic";

const SORTS = ["top", "new", "easy", "hard", "played"];

export async function GET(req: Request) {
  return respond(async () => {
    const url = new URL(req.url);
    const s = url.searchParams.get("sort") ?? "top";
    const sort = (SORTS.includes(s) ? s : "top") as LevelSort;
    const limit = Math.max(1, Math.min(60, Number(url.searchParams.get("limit")) || 24));
    const user = await getUserFromRequest(req);
    return { levels: await listLevels({ sort, limit, viewerId: user?.id ?? null }) };
  });
}
