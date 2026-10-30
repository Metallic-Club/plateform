import type { Metadata } from "next";
import Link from "next/link";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import { drawable, lookFromAvatar } from "@/lib/api/avatar";
import { WardrobeEditor } from "./WardrobeEditor";

export const metadata: Metadata = { title: "Wardrobe" };

export default async function WardrobePage() {
  const api = await getApi();
  const viewer = await api.getViewer();
  if (!viewer) {
    return (
      <div className="page" style={{ paddingBlock: "var(--s-7)" }}>
        <StateMessage
          headingLevel={1}
          title="Sign in to dress your avatar"
          actions={
            <>
              <Link href="/signin" className={button("primary")}>
                Sign in
              </Link>
              <Link href="/signup" className={button("secondary")}>
                Create an account
              </Link>
            </>
          }
        >
          <p>Your wardrobe holds the items you own. Your avatar wears the same outfit in every game.</p>
        </StateMessage>
      </div>
    );
  }
  const [avatar, inventory] = await Promise.all([api.getMyAvatar(), api.listInventory()]);
  return (
    <WardrobeEditor
      initial={lookFromAvatar(avatar)}
      inventory={drawable(inventory.items.map((i) => i.item))}
      name={viewer.user.displayName}
    />
  );
}
