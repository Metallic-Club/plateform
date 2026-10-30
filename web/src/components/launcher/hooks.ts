"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getBridge, invoke, on, type LauncherInfo } from "@/lib/launcher-bridge";
import { normalizeInstallStatus, type InstallStatus } from "@/lib/launcher-status";

const noopSubscribe = () => () => {};

/**
 * True when `window.metallic` is a bridge we can use. False on the server and
 * during hydration, so the first client render matches the server HTML.
 */
export function useHasBridge(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => getBridge() !== null,
    () => false,
  );
}

export type UpdateNotice = { version: string; required: boolean } | null;

/**
 * Install and update state from `installStatus`, refreshed on the Launcher's
 * install events. Also keeps the latest `updateReady` event and live progress
 * percentages, which arrive between status reads.
 */
export function useInstallStatus() {
  const hasBridge = useHasBridge();
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [update, setUpdate] = useState<UpdateNotice>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(normalizeInstallStatus(await invoke("installStatus")));
    } catch {
      // Leave the last known status; the page says what it can.
    }
  }, []);

  useEffect(() => {
    if (!hasBridge) return;
    let live = true;
    invoke("installStatus").then(
      (raw) => {
        if (live) setStatus(normalizeInstallStatus(raw));
      },
      () => {},
    );
    const offs = [
      on("installProgress", (e) => {
        if (typeof e.product === "string" && typeof e.percent === "number") {
          setProgress((p) => ({ ...p, [e.product]: Math.max(0, Math.min(100, Math.round(e.percent))) }));
        }
      }),
      on("installFinished", (e) => {
        setProgress((p) => {
          const next = { ...p };
          delete next[e.product];
          return next;
        });
        void refresh();
      }),
      on("updateReady", (e) => {
        if (typeof e.version === "string") setUpdate({ version: e.version, required: e.required === true });
        void refresh();
      }),
    ];
    return () => {
      live = false;
      offs.forEach((off) => off());
    };
  }, [hasBridge, refresh]);

  return { hasBridge, status, progress, update, refresh };
}

/** `getInfo` once, for version lines. */
export function useLauncherInfo(): LauncherInfo | null {
  const hasBridge = useHasBridge();
  const [info, setInfo] = useState<LauncherInfo | null>(null);
  useEffect(() => {
    if (!hasBridge) return;
    let live = true;
    invoke("getInfo").then(
      (i) => {
        if (live) setInfo(i);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [hasBridge]);
  return info;
}
