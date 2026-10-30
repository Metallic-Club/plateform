import type { AvatarLook, PresenceStatus } from "@/lib/api/types";
import { AvatarFigure } from "./AvatarFigure";
import styles from "./Avatar.module.css";

const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  in_game: "In a game",
  in_studio: "In Studio",
  offline: "Offline",
};

/**
 * A person's head and shoulders in a circle. People are round; games and items are milled.
 * Draws the procedural look when there is one, else the spec's headshot, else a blank figure.
 */
export function Avatar({
  user,
  size = 40,
  presence,
}: {
  user: { displayName: string; avatarHeadshotUrl: string | null; look?: AvatarLook };
  size?: number;
  /** Shows a dot for online, in a game or in Studio. */
  presence?: PresenceStatus;
}) {
  return (
    <span className={styles.wrap} style={{ width: size, height: size }}>
      {user.look ? (
        <AvatarFigure look={user.look} crop="bust" className={styles.figure} />
      ) : user.avatarHeadshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- CDN headshots
        <img src={user.avatarHeadshotUrl} alt="" className={styles.figure} width={size} height={size} />
      ) : (
        <AvatarFigure look={{ skin: "#9a9ca5", equipped: {} }} crop="bust" className={styles.figure} />
      )}
      {presence && presence !== "offline" ? (
        <span className={styles.dot} data-status={presence} role="img" aria-label={PRESENCE_LABEL[presence]} />
      ) : null}
    </span>
  );
}
