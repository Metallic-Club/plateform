import { playHref } from "@/lib/links";
import type { Shell } from "@/lib/prefs";
import { Icon } from "../Icon";
import { button, type ButtonSize, type ButtonVariant } from "../ui/button";
import { GetMetallicButton } from "./GetMetallicButton";

/**
 * Play. Inside the launcher it is a plain metallic:// link the launcher
 * handles; in a browser it opens the "Get Metallic" flow.
 */
export function PlayButton({
  game,
  shell,
  serverId,
  size = "regular",
  label = "Play",
  block = false,
  variant = "primary",
}: {
  game: { id: string; name: string };
  shell: Shell;
  serverId?: string;
  size?: ButtonSize;
  label?: string;
  block?: boolean;
  variant?: ButtonVariant;
}) {
  const href = playHref(game.id, serverId);
  if (shell === "launcher") {
    return (
      <a href={href} className={button(variant, size, block)}>
        <Icon name="play" size={size === "large" ? 20 : 16} />
        {label}
      </a>
    );
  }
  return <GetMetallicButton gameName={game.name} href={href} size={size} label={label} block={block} variant={variant} />;
}
