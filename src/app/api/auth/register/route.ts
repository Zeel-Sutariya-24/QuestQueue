import { limitAuth, respond } from "@/server/http";
import { registerUser } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return respond(async () => {
    limitAuth(req);
    return registerUser(await req.json().catch(() => ({})));
  });
}
