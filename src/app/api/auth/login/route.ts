import { limitAuth, respond } from "@/server/http";
import { loginUser } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return respond(async () => {
    limitAuth(req);
    return loginUser(await req.json().catch(() => ({})));
  });
}
