import { joinHref } from "@/lib/links";
import type { Shell } from "@/lib/prefs";
import { Icon } from "../Icon";
import { button, type ButtonSize, type ButtonVariant } from "../ui/button";
import { GetMetallicButton } from "./GetMetallicButton";

/**
 * Play or Join. Inside the launcher it is a plain link to /play, which
 * redirects to the metallic:// launch link; in a browser it opens the
 * "Get Metallic" flow first.
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
      <a href={href} rel="nofollow" className={button(variant, size, block)}>
        <Icon name="play" size={size === "large" ? 20 : 16} />
        {label}
      </a>
    );
  }
  return <GetMetallicButton gameName={game.name} href={href} size={size} label={label} block={block} variant={variant} />;
}
