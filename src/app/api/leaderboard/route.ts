import { respond } from "@/server/http";
import { getLeaderboards } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return respond(async () => {
    const limit = Math.max(1, Math.min(50, Number(new URL(req.url).searchParams.get("limit")) || 10));
    return getLeaderboards(limit);
  });
}
