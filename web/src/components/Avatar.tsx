import type { UserSummary } from "@/lib/api/types";
import { AvatarFigure } from "./AvatarFigure";
import styles from "./Avatar.module.css";

/** A person's head and shoulders in a circle. People are round; games and items are milled. */
export function Avatar({
  user,
  size = 40,
  showPresence = false,
}: {
  user: Pick<UserSummary, "avatar" | "displayName" | "presence">;
  size?: number;
  showPresence?: boolean;
}) {
  const status = user.presence.status;
  return (
    <span className={styles.wrap} style={{ width: size, height: size }}>
      <AvatarFigure look={user.avatar} crop="bust" className={styles.figure} />
      {showPresence && status !== "offline" ? (
        <span
          className={styles.dot}
          data-status={status}
          role="img"
          aria-label={status === "in-game" ? "In a game" : "Online"}
        />
      ) : null}
    </span>
  );
}
