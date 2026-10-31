"use client";

import Link from "next/link";
import { useInstallStatus } from "../launcher/hooks";
import { Icon } from "../Icon";
import styles from "./Shell.module.css";

/*
 * Launcher-only header status: shows up only when something needs attention
 * (an update to restart into, an update downloading, Studio installing).
 * Otherwise the header stays quiet. Reads `installStatus` and the install and
 * update events through the bridge; with no bridge it renders nothing.
 */
export function LauncherStatusSlot() {
  const { hasBridge, status, progress, update } = useInstallStatus();
  if (!hasBridge || !status) return null;

  const restart =
    status.launcher.state === "readyToRestart"
      ? { version: status.launcher.version ?? update?.version, required: status.launcher.required || !!update?.required }
      : update;

  let text: string | null = null;
  let tone: "update" | "busy" = "busy";
  if (restart) {
    tone = "update";
    text = restart.required ? "Update required: restart Metallic" : "Restart to update";
  } else if (status.launcher.state === "downloading") {
    text = `Updating Metallic${status.launcher.percent !== undefined ? `, ${status.launcher.percent}%` : ""}`;
  } else if (status.studio.state === "installing" || progress.studio !== undefined) {
    const pct = progress.studio ?? (status.studio.state === "installing" ? status.studio.percent : undefined);
    text = `Installing Studio${pct !== undefined ? `, ${pct}%` : ""}`;
  }

  return (
    <p role="status" aria-live="polite" className={styles.launcherStatusWrap}>
      {text ? (
        <Link href="/downloads" className={styles.launcherStatus} data-tone={tone}>
          <Icon name={tone === "update" ? "download" : "progress"} size={16} />
          <span>{text}</span>
          {restart?.version ? <span className="visually-hidden">, version {restart.version}</span> : null}
        </Link>
      ) : null}
    </p>
  );
}
