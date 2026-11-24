import { limitAuth, respond } from "@/server/http";
import { createGuest } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return respond(async () => {
    limitAuth(req);
    return createGuest();
  });
}
