import Link from "next/link";
import type { GameSummary } from "@/lib/api/types";
import { formatCompact, ratingPercent } from "@/lib/format";
import { GameArt } from "./GameArt";
import styles from "./GameTile.module.css";

/**
 * One game: picture, name, and the two numbers players use to choose
 * (people playing right now, share of likes). No badges, no hover zoom.
 */
export function GameTile({ game, note }: { game: GameSummary; note?: string }) {
  const pct = ratingPercent(game.rating);
  return (
    <Link href={`/games/${game.id}`} className={styles.tile}>
      <span className={`milled ${styles.art}`}>
        <GameArt art={game.art} />
      </span>
      <span className={styles.name}>{game.name}</span>
      <span className={styles.meta}>
        <span>{formatCompact(game.playing)} playing</span>
        {pct !== null ? <span>{pct}% like it</span> : null}
      </span>
      {note ? <span className={styles.note}>{note}</span> : null}
    </Link>
  );
}

export function GameRow({ game, rank, trailing }: { game: GameSummary; rank?: number; trailing?: string }) {
  const pct = ratingPercent(game.rating);
  return (
    <Link href={`/games/${game.id}`} className={styles.row}>
      {rank !== undefined ? <span className={styles.rank}>{rank}</span> : null}
      <span className={`milled-sm ${styles.rowArt}`}>
        <GameArt art={game.art} />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowName}>{game.name}</span>
        <span className={styles.meta}>
          {trailing ?? (
            <>
              <span>{formatCompact(game.playing)} playing</span>
              {pct !== null ? <span>{pct}%</span> : null}
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
