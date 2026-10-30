"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import type { Rating } from "@/lib/api/types";
import styles from "./game.module.css";

const full = new Intl.NumberFormat("en-US");
type Vote = "up" | "down" | null;

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, [key]);
  function update(next: T) {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  }
  return [value, update] as const;
}

/*
 * Favourite and rating controls. Preview only: choices are kept in this
 * browser until the accounts API exists.
 * TODO(api): POST /v1/games/{id}/favourite and /v1/games/{id}/vote.
 */
export function Reactions({ gameId, rating, favourites }: { gameId: string; rating: Rating; favourites: number }) {
  const [fav, setFav] = useStored<boolean>(`fav:${gameId}`, false);
  const [vote, setVote] = useStored<Vote>(`vote:${gameId}`, null);

  const up = rating.up + (vote === "up" ? 1 : 0);
  const down = rating.down + (vote === "down" ? 1 : 0);
  const total = up + down;
  const pct = total ? Math.round((up / total) * 100) : 0;

  return (
    <div className={styles.reactions}>
      <button type="button" className={styles.favButton} aria-pressed={fav} onClick={() => setFav(!fav)}>
        <Icon name={fav ? "heartFilled" : "heart"} />
        {fav ? "Favourited" : "Favourite"}
        <span className={styles.reactCount}>{full.format(favourites + (fav ? 1 : 0))}</span>
      </button>

      <div className={styles.rating}>
        <div className={styles.ratingTop}>
          <span>
            <strong className={styles.ratingPct}>{pct}%</strong> of {full.format(total)} players like it
          </span>
          <span className={styles.voteButtons} role="group" aria-label="Rate this game">
            <button
              type="button"
              className={styles.vote}
              aria-pressed={vote === "up"}
              onClick={() => setVote(vote === "up" ? null : "up")}
            >
              <Icon name="thumbUp" />
              <span className="visually-hidden">I like it</span>
            </button>
            <button
              type="button"
              className={styles.vote}
              aria-pressed={vote === "down"}
              onClick={() => setVote(vote === "down" ? null : "down")}
            >
              <Icon name="thumbDown" />
              <span className="visually-hidden">I don&apos;t like it</span>
            </button>
          </span>
        </div>
        <div className={styles.ratingBar} aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
