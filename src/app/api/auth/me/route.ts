import { respond } from "@/server/http";
import { getUserFromRequest } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return respond(async () => ({ user: await getUserFromRequest(req) }));
}
