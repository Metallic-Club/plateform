"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createLaunchUri } from "@/app/actions";
import { BridgeError, describeBridgeError, getBridge, invoke } from "@/lib/launcher-bridge";
import { Icon } from "../Icon";
import { button, type ButtonSize, type ButtonVariant } from "../ui/button";
import styles from "./play.module.css";

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "started" } | { kind: "error"; text: string };

/**
 * Play inside the Launcher. A plain link to /play/<gameId> (which redirects to
 * the metallic:// launch link the Launcher catches), upgraded when the bridge is
 * there: it fetches the launchUri from POST /v1/games/{gameId}/join and calls
 * the bridge's `play`, so errors can be shown on the page.
 */
export function LauncherPlayButton({
  gameId,
  href,
  serverId,
  followUserId,
  size = "regular",
  label = "Play",
  block = false,
  variant = "primary",
}: {
  gameId: string;
  href: string;
  serverId?: string;
  followUserId?: string;
  size?: ButtonSize;
  label?: string;
  block?: boolean;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function settle(next: Phase) {
    setPhase(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase({ kind: "idle" }), next.kind === "error" ? 8000 : 4000);
  }

  async function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // No bridge (an old Launcher, or a preview): the plain link does the job.
    if (!getBridge() || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (phase.kind === "busy") return;
    setPhase({ kind: "busy" });
    const res = await createLaunchUri(gameId, { serverId, followUserId });
    if (!res.ok) {
      if (res.reason === "signin") {
        router.push(`/signin?next=${encodeURIComponent(`/games/${gameId}`)}`);
        setPhase({ kind: "idle" });
        return;
      }
      settle({ kind: "error", text: res.reason === "full" ? "That server is full. Pick another one." : "Could not get a place in the game. Try again." });
      return;
    }
    try {
      await invoke("play", { launchUri: res.launchUri });
      settle({ kind: "started" });
    } catch (err) {
      settle({ kind: "error", text: describeBridgeError(err instanceof BridgeError ? err.code : "failed") });
    }
  }

  const status =
    phase.kind === "busy" ? "Starting the game" : phase.kind === "started" ? "Game starting in its own window" : phase.kind === "error" ? phase.text : "";

  return (
    <span className={block ? styles.launchWrapBlock : styles.launchWrap}>
      <a
        href={href}
        rel="nofollow"
        className={button(variant, size, block)}
        onClick={onClick}
        aria-disabled={phase.kind === "busy" ? true : undefined}
      >
        <Icon name="play" size={size === "large" ? 20 : 16} />
        {label}
      </a>
      <span role="status" aria-live="polite" className={styles.launchStatus} data-tone={phase.kind} hidden={!status}>
        {status}
      </span>
    </span>
  );
}
