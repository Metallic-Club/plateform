import { getApi } from "@/lib/api";
import { usernameProblem } from "@/lib/username";

/** Username check used by the sign-up form while typing. */
export async function GET(req: Request) {
  const username = new URL(req.url).searchParams.get("u")?.trim() ?? "";
  const problem = usernameProblem(username);
  if (problem) return Response.json({ available: false, reason: problem });
  try {
    const available = await (await getApi()).isUsernameAvailable(username);
    return Response.json({ available, reason: available ? null : "That username is taken." });
  } catch {
    return Response.json({ available: null, reason: "Could not check right now." }, { status: 503 });
  }
}
