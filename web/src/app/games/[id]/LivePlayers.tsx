"use client";

import { useEffect, useState } from "react";
import type { LiveCount } from "@/lib/api/types";
import styles from "./game.module.css";

const full = new Intl.NumberFormat("en-US");
const POLL_MS = 15_000;

/**
 * Players in game right now. Polls every 15 seconds while the tab is visible
 * and says when the number is stale instead of showing a wrong one silently.
 */
export function LivePlayers({ initial }: { initial: LiveCount }) {
  const [count, setCount] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function poll() {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/games/${encodeURIComponent(initial.gameId)}/live`, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const next = (await res.json()) as LiveCount;
          if (!cancelled) {
            setCount(next);
            setStale(false);
          }
        } catch {
          if (!cancelled) setStale(true);
        }
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial.gameId]);

  return (
    <p className={styles.live}>
      <span className={styles.liveCount}>{full.format(count.playing)}</span>
      <span className={styles.liveLabel}>
        playing now on {count.servers} {count.servers === 1 ? "server" : "servers"}
        {stale ? <span className={styles.stale}> (could not refresh, showing the last count)</span> : null}
      </span>
    </p>
  );
}
