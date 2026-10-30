"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { GameDetail, Rating } from "@/lib/api/types";
import styles from "./game.module.css";

const full = new Intl.NumberFormat("en-US");
type Vote = "up" | "down" | null;

const CANNOT_VOTE: Record<string, string> = {
  play_longer: "You can rate this game after playing it for 10 minutes.",
  verify_email: "Verify your email to rate games.",
  account_too_new: "Accounts can rate games from 3 days after sign-up.",
  restricted: "Rating is turned off for this account.",
};

/*
 * Favourite and rating, following the spec's rules: signed-out visitors are
 * asked to sign in, and votes open after 10 minutes of play.
 * Preview: changes last for this visit and are not sent.
 * TODO(api): PUT/DELETE /v1/me/favorites/{gameId}; PUT/DELETE /v1/games/{gameId}/rating.
 */
export function Reactions({
  gameId,
  rating,
  favorites,
  viewer,
}: {
  gameId: string;
  rating: Rating;
  favorites: number;
  viewer: GameDetail["viewer"];
}) {
  const [fav, setFav] = useState(viewer?.isFavorite ?? false);
  const [vote, setVote] = useState<Vote>(rating.myVote ?? viewer?.vote ?? null);
  const signedIn = Boolean(viewer);
  const canVote = rating.canVote ?? viewer?.canVote ?? false;

  // Totals already include the stored vote; adjust only for a change made on this page.
  const was = rating.myVote ?? null;
  const up = rating.up - (was === "up" ? 1 : 0) + (vote === "up" ? 1 : 0);
  const down = rating.down - (was === "down" ? 1 : 0) + (vote === "down" ? 1 : 0);
  const votes = up + down;
  const pct = votes >= 20 ? Math.round((up / votes) * 100) : null;
  const favCount = favorites - (viewer?.isFavorite ? 1 : 0) + (fav ? 1 : 0);
  const note = !signedIn ? null : !canVote ? CANNOT_VOTE[rating.cannotVoteReason ?? ""] : null;

  return (
    <div className={styles.reactions}>
      {signedIn ? (
        <button type="button" className={styles.favButton} aria-pressed={fav} onClick={() => setFav(!fav)}>
          <Icon name={fav ? "heartFilled" : "heart"} />
          {fav ? "Favourited" : "Favourite"}
          <span className={styles.reactCount}>{full.format(favCount)}</span>
        </button>
      ) : (
        <Link href={`/signin?next=/games/${gameId}`} className={styles.favButton}>
          <Icon name="heart" />
          Sign in to favourite
          <span className={styles.reactCount}>{full.format(favorites)}</span>
        </Link>
      )}

      <div className={styles.rating}>
        <div className={styles.ratingTop}>
          <span>
            {pct !== null ? (
              <>
                <strong className={styles.ratingPct}>{pct}%</strong> of {full.format(votes)} players like it
              </>
            ) : (
              `Not enough votes yet (${votes})`
            )}
          </span>
          {signedIn && canVote ? (
            <span className={styles.voteButtons} role="group" aria-label="Rate this game">
              <button type="button" className={styles.vote} aria-pressed={vote === "up"} onClick={() => setVote(vote === "up" ? null : "up")}>
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
          ) : null}
        </div>
        {pct !== null ? (
          <div className={styles.ratingBar} aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {note ? <p className={styles.voteNote}>{note}</p> : null}
      </div>
    </div>
  );
}
