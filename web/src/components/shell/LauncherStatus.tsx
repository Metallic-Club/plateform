"use client";

import { useSyncExternalStore } from "react";

/*
 * Launcher-only slot for install and update status.
 * The launcher's web view is expected to expose `window.metallicLauncher`
 * with getStatus() and a "metallic-launcher-status" event. Until that bridge
 * exists this shows a plain placeholder, labelled as such.
 * TODO(launcher): wire to the real bridge once its contract is written.
 */

type LauncherStatus =
  | { state: "up-to-date"; version: string }
  | { state: "updating"; version: string; progress: number }
  | { state: "update-ready"; version: string };

declare global {
  interface Window {
    metallicLauncher?: { getStatus(): LauncherStatus };
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("metallic-launcher-status", cb);
  return () => window.removeEventListener("metallic-launcher-status", cb);
}

let cached: { key: string; value: LauncherStatus | null } = { key: "", value: null };
function read(): LauncherStatus | null {
  const value = window.metallicLauncher?.getStatus() ?? null;
  const key = JSON.stringify(value);
  if (key !== cached.key) cached = { key, value };
  return cached.value;
}

export function LauncherStatusSlot() {
  const status = useSyncExternalStore(subscribe, read, () => null);
  let text = "Launcher status not connected";
  if (status?.state === "up-to-date") text = `Metallic ${status.version}, up to date`;
  if (status?.state === "updating") text = `Updating to ${status.version}, ${Math.round(status.progress * 100)}%`;
  if (status?.state === "update-ready") text = `Restart to update to ${status.version}`;
  return (
    <p className="launcher-status" role="status" aria-live="polite">
      {text}
    </p>
  );
}
