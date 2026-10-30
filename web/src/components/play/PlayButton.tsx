import { joinHref } from "@/lib/links";
import type { Shell } from "@/lib/prefs";
import type { ButtonSize, ButtonVariant } from "../ui/button";
import { GetMetallicButton } from "./GetMetallicButton";
import { LauncherPlayButton } from "./LauncherPlayButton";

/**
 * Play or Join. Inside the Launcher it calls the bridge's `play` (falling back
 * to the /play redirect); in a browser it opens the "Get Metallic Play" flow first.
 */
export function PlayButton({
  game,
  shell,
  serverId,
  followUserId,
  size = "regular",
  label = "Play",
  block = false,
  variant = "primary",
}: {
  game: { id: string; name: string };
  shell: Shell;
  serverId?: string;
  /** Join this friend wherever they are. */
  followUserId?: string;
  size?: ButtonSize;
  label?: string;
  block?: boolean;
  variant?: ButtonVariant;
}) {
  const href = joinHref(game.id, { serverId, followUserId });
  if (shell === "launcher") {
    return (
      <LauncherPlayButton
        gameId={game.id}
        href={href}
        serverId={serverId}
        followUserId={followUserId}
        size={size}
        label={label}
        block={block}
        variant={variant}
      />
    );
  }
  return <GetMetallicButton gameName={game.name} href={href} size={size} label={label} block={block} variant={variant} />;
}
