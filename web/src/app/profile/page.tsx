import { redirect } from "next/navigation";
import { getApi } from "@/lib/api";

/** /profile goes to the signed-in player's own profile, or to sign in. */
export default async function MyProfile() {
  const viewer = await (await getApi()).getViewer();
  redirect(viewer ? `/users/${viewer.user.username}` : "/signin");
}
