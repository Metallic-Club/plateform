import type { Metadata } from "next";
import Link from "next/link";
import { LauncherDownloads } from "@/components/launcher/LauncherDownloads";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getShell } from "@/lib/prefs.server";

export const metadata: Metadata = { title: "Downloads" };

/*
 * Downloads: Studio (Get / Open) and the app's own updates, read
 * from the Launcher bridge. In a browser it points to the app instead.
 */
export default async function DownloadsPage() {
  const shell = await getShell();
  return (
    <div className="page" style={{ display: "grid", gap: "var(--s8)", paddingBlock: "var(--s9)" }}>
      <h1 className="wide" style={{ fontSize: "var(--t-title)", fontWeight: 800 }}>
        Downloads
      </h1>
      {shell === "launcher" ? (
        <LauncherDownloads />
      ) : (
        <StateMessage
          title="Downloads live in Metallic Play"
          actions={
            <Link href="/download" className={button("primary")}>
              Get Metallic Play
            </Link>
          }
        >
          <p>This page shows installs and updates when you open it inside the app.</p>
        </StateMessage>
      )}
    </div>
  );
}
