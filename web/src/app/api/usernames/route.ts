import { getApi } from "@/lib/api";
import { usernameProblem, usernameReason } from "@/lib/username";

/** Username check for the sign-up form while typing. Wraps GET /v1/auth/username-check. */
export async function GET(req: Request) {
  const username = new URL(req.url).searchParams.get("u")?.trim() ?? "";
  const problem = usernameProblem(username);
  if (problem) return Response.json({ available: false, reason: problem });
  try {
    const check = await (await getApi()).checkUsername(username);
    return Response.json({ available: check.available, reason: check.available ? null : usernameReason(check.reason) });
  } catch {
    return Response.json({ available: null, reason: "Could not check right now." }, { status: 503 });
  }
}
