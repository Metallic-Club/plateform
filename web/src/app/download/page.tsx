import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Emblem } from "@/components/Emblem";
import { button } from "@/components/ui/button";
import { getShell } from "@/lib/prefs.server";
import styles from "./download.module.css";

export const metadata: Metadata = { title: "Get Metallic" };

/*
 * Download page. No public builds exist yet, so the page says so instead of
 * offering a dead button.
 * TODO(release): link real installers per platform when they are published.
 */
export default async function DownloadPage() {
  // Inside the app, "download the app" makes no sense: show its Downloads instead.
  if ((await getShell()) === "launcher") redirect("/downloads");
  return (
    <div className={`page ${styles.download}`}>
      <section className={styles.app} aria-labelledby="app-title">
        <div className={`milled ${styles.mark}`} aria-hidden="true">
          <Emblem size={120} />
        </div>
        <div className={styles.text}>
          <h1 id="app-title" className={`wide ${styles.title}`}>
            Get Metallic
          </h1>
          <p className={styles.lede}>
            The Metallic app plays every game on this site. It also keeps your games up to date and opens them straight
            from the Play buttons here.
          </p>
          <p className={styles.status} role="note">
            The app is not available to download yet. The installer will be on this page when it is.
          </p>
          <div className={styles.actions}>
            <span className={button("primary", "large")} aria-disabled="true">
              Download (coming soon)
            </span>
            <a href="metallic://open" className={button("secondary", "large")}>
              Open Metallic
            </a>
          </div>
          <p className={styles.hint}>Already installed? Open Metallic launches it if it is on this computer.</p>
        </div>
      </section>

      <section id="studio" className={styles.studio} aria-labelledby="studio-title">
        <h2 id="studio-title" className={styles.h2}>
          Metallic Studio
        </h2>
        <p>
          Studio, the editor for making games, is also not public yet. See what it will start you with on the{" "}
          <Link href="/create">Create page</Link>.
        </p>
      </section>
    </div>
  );
}
