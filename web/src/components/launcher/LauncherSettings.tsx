"use client";

import { useEffect, useState } from "react";
import { BridgeError, describeBridgeError, invoke } from "@/lib/launcher-bridge";
import { useHasBridge, useLauncherInfo } from "./hooks";
import styles from "./launcher.module.css";

/**
 * The Launcher settings the site may change (plateform #7, section 2): only
 * close-to-tray. The app's other settings live on its own local page.
 */
export function LauncherSettings() {
  const hasBridge = useHasBridge();
  const info = useLauncherInfo();
  const [closeToTray, setCloseToTray] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasBridge) return;
    let live = true;
    invoke("getSettings").then(
      (s) => {
        if (live) setCloseToTray(s.closeToTray === true);
      },
      (e) => {
        if (live) setError(describeBridgeError(e instanceof BridgeError ? e.code : "failed"));
      },
    );
    return () => {
      live = false;
    };
  }, [hasBridge]);

  if (!hasBridge) {
    return <p className={styles.cardText}>Metallic Play is not connected, so its settings cannot be read here.</p>;
  }

  async function change(next: boolean) {
    const before = closeToTray;
    setCloseToTray(next);
    setSaving(true);
    setError(null);
    try {
      const s = await invoke("setSettings", { patch: { closeToTray: next } });
      setCloseToTray(s.closeToTray === true);
    } catch (e) {
      setCloseToTray(before);
      setError(describeBridgeError(e instanceof BridgeError ? e.code : "failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.settings}>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={closeToTray === true}
          disabled={closeToTray === null || saving}
          onChange={(e) => change(e.currentTarget.checked)}
          aria-describedby="tray-note"
        />
        <span>
          <span className={styles.checkLabel}>Keep Metallic running when I close the window</span>
          <span id="tray-note" className={styles.checkNote}>
            Metallic stays in the system tray, so games start faster and updates download in the background. Quit it
            from the tray icon.
          </span>
        </span>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className={styles.cardMeta}>
          Metallic <span className="mono">{info.launcherVersion}</span>
          {info.channel && info.channel !== "stable" ? `, ${info.channel} channel` : null}
        </p>
      ) : null}
    </div>
  );
}
