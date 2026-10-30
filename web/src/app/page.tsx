import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { GameArt } from "@/components/GameArt";
import { GameRow, GameTile } from "@/components/GameTile";
import { PlayButton } from "@/components/play/PlayButton";
import { Shelf } from "@/components/Shelf";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import { GENRES } from "@/lib/api/types";
import { formatCount, formatDate, GENRE_LABEL, ratingPercent, timeAgo } from "@/lib/format";
import { getShell } from "@/lib/prefs.server";
import styles from "./home.module.css";

export default async function HomePage() {
  const api = await getApi();
  const [feed, viewer, shell] = await Promise.all([api.getHomeFeed(), api.getViewer(), getShell()]);
  const f = feed.featured;
  const pct = ratingPercent(f.rating);
  const favourites = viewer ? await api.listFavourites(viewer.user.id) : [];

  return (
    <div className={`page ${styles.home}`}>
      <h1 className="visually-hidden">Home</h1>

      <div className={styles.lead}>
        <section className={styles.feature} aria-labelledby="featured-name">
          <Link href={`/games/${f.id}`} className={`milled ${styles.featureArt}`} tabIndex={-1} aria-hidden="true">
            <GameArt art={f.art} />
          </Link>
          <div className={`milled ${styles.plate}`}>
            <h2 id="featured-name" className={`wide ${styles.featureName}`}>
              <Link href={`/games/${f.id}`}>{f.name}</Link>
            </h2>
            <p className={styles.featureTagline}>{f.tagline}</p>
            <p className={styles.featureMeta}>
              <span>
                <strong>{formatCount(f.playing)}</strong> playing now
              </span>
              {pct !== null ? (
                <span>
                  <strong>{pct}%</strong> like it
                </span>
              ) : null}
              <span>{GENRE_LABEL[f.genre]}</span>
              <span>by {f.creator.name}</span>
            </p>
            <div className={styles.featureActions}>
              <PlayButton game={f} shell={shell} size="large" />
              <Link href={`/games/${f.id}`} className={button("secondary", "large")}>
                Servers and details
              </Link>
            </div>
          </div>
        </section>

        <div className={styles.side}>
        <section className={styles.continue} aria-labelledby="continue-title">
          <h2 id="continue-title" className={styles.sectionTitle}>
            Continue playing
          </h2>
          {feed.continuePlaying.length > 0 ? (
            <ul role="list" className={styles.rows}>
              {feed.continuePlaying.map(({ game, lastPlayedAt }) => (
                <li key={game.id}>
                  <GameRow game={game} trailing={`Played ${timeAgo(lastPlayedAt)}`} />
                </li>
              ))}
            </ul>
          ) : viewer ? (
            <p className={styles.quiet}>Games you play show up here, so you can jump back in from the top of the page.</p>
          ) : (
            <p className={styles.quiet}>
              <Link href="/signin" className={styles.inlineLink}>
                Sign in
              </Link>{" "}
              to pick up the games you played last.
            </p>
          )}
        </section>
        {favourites.length > 0 ? (
          <section className={styles.continue} aria-labelledby="favourites-title">
            <h2 id="favourites-title" className={styles.sectionTitle}>
              Your favourites
            </h2>
            <ul role="list" className={styles.rows}>
              {favourites.slice(0, 4).map((g) => (
                <li key={g.id}>
                  <GameRow game={g} />
                </li>
              ))}
            </ul>
            {viewer && favourites.length > 4 ? (
              <Link href={`/users/${viewer.user.username}#favourites`} className={styles.more}>
                All {favourites.length} favourites
              </Link>
            ) : null}
          </section>
        ) : null}
        </div>
      </div>

      {feed.friendsPlaying.length > 0 ? (
        <section className={styles.friends} aria-labelledby="friends-title">
          <div className={styles.friendsHead}>
            <h2 id="friends-title" className={styles.sectionTitle}>
              Friends playing now
            </h2>
            <Link href="/friends" className={styles.more}>
              All friends
            </Link>
          </div>
          <ul role="list" className={styles.friendList}>
            {feed.friendsPlaying.map(({ friend, game }) => (
              <li key={friend.id} className={styles.friend}>
                <Link href={`/users/${friend.username}`} className={styles.friendWho}>
                  <Avatar user={friend} size={44} showPresence />
                  <span className={styles.friendText}>
                    <span className={styles.friendName}>{friend.displayName}</span>
                    <span className={styles.friendGame}>{game.name}</span>
                  </span>
                </Link>
                <PlayButton
                  game={game}
                  shell={shell}
                  serverId={friend.presence.status === "in-game" ? (friend.presence.serverId ?? undefined) : undefined}
                  label="Join"
                  size="small"
                  variant="secondary"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.chart} aria-labelledby="chart-title">
        <div className={styles.chartHead}>
          <h2 id="chart-title" className={`wide ${styles.chartTitle}`}>
            Most played right now
          </h2>
          <p className={styles.quiet}>Ranked by how many people are in each game at this moment.</p>
        </div>
        <ol className={styles.chartList}>
          {feed.mostPlayed.map((g, i) => (
            <li key={g.id}>
              <GameRow game={g} rank={i + 1} />
            </li>
          ))}
        </ol>
        <Link href="/explore?sort=playing" className={styles.more}>
          Full list in Explore
        </Link>
      </section>

      {feed.firstParty.length > 0 ? (
        <section className={styles.firstParty} aria-labelledby="fp-title">
          <h2 id="fp-title" className={styles.sectionTitle}>
            Made by Metallic
          </h2>
          <ul role="list" className={styles.fpList}>
            {feed.firstParty.map((g) => (
              <li key={g.id}>
                <Link href={`/games/${g.id}`} className={styles.fpItem}>
                  <span className={`milled ${styles.fpArt}`}>
                    <GameArt art={g.art} />
                  </span>
                  <span className={styles.fpText}>
                    <span className={`wide ${styles.fpName}`}>{g.name}</span>
                    <span>{g.tagline}</span>
                    <span className={styles.quiet}>{formatCount(g.playing)} playing now</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feed.becauseYouPlayed ? (
        <Shelf
          id="because"
          title={`Because you played ${feed.becauseYouPlayed.basis.name}`}
          description="Co-op games with a slower pace, picked from what you play most."
          moreHref={`/games/${feed.becauseYouPlayed.basis.id}#similar`}
          moreLabel="More like it"
        >
          {feed.becauseYouPlayed.games.map((g) => (
            <li key={g.id}>
              <GameTile game={g} />
            </li>
          ))}
        </Shelf>
      ) : null}

      {feed.newThisWeek.length > 0 ? (
        <Shelf id="new" title="New this fortnight" moreHref="/explore?sort=new" moreLabel="All new games" columns={5}>
          {feed.newThisWeek.map((g) => (
            <li key={g.id}>
              <GameTile game={g} note={`Released ${formatDate(g.createdAt)}`} />
            </li>
          ))}
        </Shelf>
      ) : null}

      <section className={styles.genres} aria-labelledby="genres-title">
        <h2 id="genres-title" className={styles.sectionTitle}>
          Browse by genre
        </h2>
        <ul role="list" className={styles.genreList}>
          {GENRES.map((g) => (
            <li key={g}>
              <Link href={`/explore?genre=${g}`} className={`wide ${styles.genre}`}>
                {GENRE_LABEL[g]}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
