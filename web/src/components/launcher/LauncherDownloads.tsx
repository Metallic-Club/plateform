"use client";

import Link from "next/link";
import { useState } from "react";
import { BridgeError, describeBridgeError, invoke } from "@/lib/launcher-bridge";
import type { LauncherState, ProductState } from "@/lib/launcher-status";
import { Icon } from "../Icon";
import { StateMessage } from "../StateMessage";
import { button } from "../ui/button";
import { useInstallStatus, useLauncherInfo } from "./hooks";
import styles from "./launcher.module.css";

/*
 * Launcher-only Downloads (plateform #7, section 3): Metallic Studio (Get or
 * Open), the Player, and the app's own update state including
 * "Restart to update". Everything comes from the bridge; nothing here is
 * rendered on the server, because only the Launcher knows it.
 */
export function LauncherDownloads() {
  const { hasBridge, status, progress, update, refresh } = useInstallStatus();
  const info = useLauncherInfo();
  const [studioError, setStudioError] = useState<string | null>(null);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasBridge) {
    return (
      <StateMessage
        title="The Metallic app is not connected"
        actions={
          <Link href="/explore" className={button("secondary")}>
            Find a game
          </Link>
        }
      >
        <p>This page shows installs and updates when the Metallic app opens it. Here it has nothing to read from.</p>
      </StateMessage>
    );
  }

  if (!status) {
    return (
      <p className={styles.loading} role="status">
        Reading what is installed
      </p>
    );
  }

  async function run(cmd: "installStudio" | "openStudio") {
    setStudioError(null);
    setBusy(true);
    try {
      await invoke(cmd);
      if (cmd === "installStudio") await refresh();
    } catch (e) {
      setStudioError(describeBridgeError(e instanceof BridgeError ? e.code : "failed"));
    } finally {
      setBusy(false);
    }
  }

  async function restartNow() {
    setRestartError(null);
    setBusy(true);
    try {
      // On success the Launcher closes this page, so there is nothing to do after.
      await invoke("restartToUpdate");
    } catch (e) {
      setRestartError(describeBridgeError(e instanceof BridgeError ? e.code : "failed"));
      setBusy(false);
    }
  }

  const studioPct = progress.studio ?? (status.studio.state === "installing" ? status.studio.percent : undefined);
  const playerPct = progress.player ?? (status.player.state === "installing" ? status.player.percent : undefined);
  const restart =
    status.launcher.state === "readyToRestart"
      ? { version: status.launcher.version ?? update?.version, required: status.launcher.required || !!update?.required }
      : update;
  const studioInstalling = status.studio.state === "installing" || studioPct !== undefined;

  return (
    <div className={styles.downloads}>
      <section className={`${styles.card} ${styles.studio}`} aria-labelledby="studio-title">
        <div className={styles.cardHead}>
          <Icon name="create" size={24} />
          <div>
            <h2 id="studio-title" className={styles.cardTitle}>
              Metallic Studio
            </h2>
            <p className={styles.cardMeta}>{productLine(status.studio, studioPct)}</p>
          </div>
        </div>
        <p className={styles.cardText}>The editor for making games. Pick a template, name your game and start building.</p>
        {studioPct !== undefined ? <Progress label="Installing Studio" percent={studioPct} /> : null}
        {studioInstalling ? null : (
          <div className={styles.actions}>
            {status.studio.state === "installed" ? (
              <button type="button" className={button("primary")} onClick={() => run("openStudio")} disabled={busy}>
                Open Studio
              </button>
            ) : (
              <button type="button" className={button("primary")} onClick={() => run("installStudio")} disabled={busy}>
                <Icon name="download" size={18} />
                {status.studio.state === "failed" ? "Try the install again" : "Get Studio"}
              </button>
            )}
          </div>
        )}
        {studioError ? (
          <p className={styles.error} role="alert">
            {studioError}
          </p>
        ) : null}
      </section>

      <section className={styles.card} aria-labelledby="player-title">
        <div className={styles.cardHead}>
          <Icon name="play" size={24} />
          <div>
            <h2 id="player-title" className={styles.cardTitle}>
              Metallic Player
            </h2>
            <p className={styles.cardMeta}>{productLine(status.player, playerPct)}</p>
          </div>
        </div>
        <p className={styles.cardText}>Runs the games. It opens in its own window when you press Play.</p>
        {playerPct !== undefined ? <Progress label="Installing the Player" percent={playerPct} /> : null}
      </section>

      <section className={styles.card} aria-labelledby="app-title">
        <div className={styles.cardHead}>
          <Icon name="device" size={24} />
          <div>
            <h2 id="app-title" className={styles.cardTitle}>
              Metallic app
            </h2>
            <p className={styles.cardMeta}>
              {info ? (
                <>
                  Version <span className="mono">{info.launcherVersion}</span>
                  {info.channel && info.channel !== "stable" ? `, ${info.channel} channel` : null}
                </>
              ) : (
                "Version unknown"
              )}
            </p>
          </div>
        </div>
        {restart ? (
          <>
            <p className={styles.notice} data-tone={restart.required ? "warning" : "update"} role="status">
              <strong>{restart.required ? "Update required." : "Restart to update."}</strong>{" "}
              {restart.version ? `Version ${restart.version} is ready. ` : "An update is ready. "}
              {restart.required ? "Restart Metallic to keep playing." : "Restart Metallic to finish."}
            </p>
            <div className={styles.actions}>
              <button type="button" className={button("primary")} onClick={restartNow} disabled={busy}>
                Restart now
              </button>
            </div>
            {restartError ? (
              <p className={styles.error} role="alert">
                {restartError}
              </p>
            ) : null}
          </>
        ) : (
          <p className={styles.cardText}>{launcherLine(status.launcher)}</p>
        )}
        {status.launcher.state === "downloading" && status.launcher.percent !== undefined ? (
          <Progress label="Downloading the update" percent={status.launcher.percent} />
        ) : null}
      </section>
    </div>
  );
}

function productLine(p: ProductState, pct: number | undefined): string {
  if (pct !== undefined) return `Installing, ${pct}%`;
  switch (p.state) {
    case "installed":
      return p.version ? `Installed, version ${p.version}` : "Installed";
    case "notInstalled":
      return "Not installed";
    case "installing":
      return "Installing";
    case "failed":
      return "The last install did not finish";
    default:
      return "Status unknown";
  }
}

function launcherLine(l: LauncherState): string {
  switch (l.state) {
    case "upToDate":
      return "Up to date.";
    case "checking":
      return "Checking for updates.";
    case "downloading":
      return "Downloading an update. You can keep playing.";
    case "failed":
      return "The last update check failed. Metallic tries again later.";
    default:
      return "Metallic checks for updates when it starts.";
  }
}

function Progress({ label, percent }: { label: string; percent: number }) {
  return (
    <div className={styles.progress}>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      <span className={`${styles.pct} mono`}>{percent}%</span>
    </div>
  );
}
