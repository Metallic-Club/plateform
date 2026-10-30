import type { Metadata } from "next";
import Link from "next/link";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getShell } from "@/lib/prefs.server";

export const metadata: Metadata = { title: "Downloads" };

/*
 * Launcher-only page: game downloads and updates in progress.
 * TODO(launcher): read the queue from the launcher bridge (window.metallicLauncher).
 */
export default async function DownloadsPage() {
  const shell = await getShell();
  return (
    <div className="page" style={{ display: "grid", gap: "var(--s-5)", paddingBlock: "var(--s-6)" }}>
      <h1 className="wide" style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>
        Downloads
      </h1>
      {shell === "launcher" ? (
        <StateMessage
          title="Nothing is downloading"
          actions={
            <Link href="/explore" className={button("secondary")}>
              Find a game
            </Link>
          }
        >
          <p>Games download the first time you press Play, and update here when their creators publish changes.</p>
        </StateMessage>
      ) : (
        <StateMessage
          title="Downloads live in the Metallic app"
          actions={
            <Link href="/download" className={button("primary")}>
              Get Metallic
            </Link>
          }
        >
          <p>This page shows game downloads and updates when you open it inside the app.</p>
        </StateMessage>
      )}
    </div>
  );
}
