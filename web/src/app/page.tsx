import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { GamePicture } from "@/components/GameArt";
import { GameRow, GameTile } from "@/components/GameTile";
import { PlayButton } from "@/components/play/PlayButton";
import { Shelf } from "@/components/Shelf";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import type { Friend, HomeSection } from "@/lib/api/types";
import { formatCount, genreName, timeAgo } from "@/lib/format";
import type { Shell } from "@/lib/prefs";
import { getShell } from "@/lib/prefs.server";
import styles from "./home.module.css";

/*
 * Home renders GET /v1/home: the featured game and "continue" row open the
 * page; every other row follows in the order the API sends, each kind with
 * its own layout. Unknown kinds fall back to a plain shelf.
 */
export default async function HomePage() {
  const api = await getApi();
  const [feed, viewer, genres, shell] = await Promise.all([api.getHome(), api.getViewer(), api.listGenres(), getShell()]);
  const [history, favorites, friends] = viewer
    ? await Promise.all([
        api.listPlayHistory().catch(() => null),
        api.listFavorites().catch(() => null),
        feed.sections.some((s) => s.kind === "friends_playing") ? api.listFriends(viewer.user.id).catch(() => null) : null,
      ])
    : [null, null, null];

  const featuredSection = feed.sections.find((s) => s.kind === "featured");
  const f = featuredSection?.items[0];
  const continueSection = feed.sections.find((s) => s.kind === "continue");
  const lastPlayed = new Map(history?.items.map((h) => [h.game.id, h.lastPlayedAt]) ?? []);
  const rest = feed.sections.filter((s) => s.kind !== "featured" && s.kind !== "continue");
  const favs = favorites?.items ?? [];

  return (
    <div className={`page ${styles.home}`}>
      <h1 className="visually-hidden">Home</h1>

      <div className={styles.lead}>
        {f ? (
          <section className={styles.feature} aria-labelledby="featured-name">
            <Link href={`/games/${f.id}`} className={`milled ${styles.featureArt}`} tabIndex={-1} aria-hidden="true">
              <GamePicture game={f} />
            </Link>
            <div className={`milled ${styles.plate}`}>
              <h2 id="featured-name" className={`wide ${styles.featureName}`}>
                <Link href={`/games/${f.id}`}>{f.name}</Link>
              </h2>
              {f.tagline ? <p className={styles.featureTagline}>{f.tagline}</p> : null}
              <p className={styles.featureMeta}>
                <span>
                  <strong>{formatCount(f.playing)}</strong> playing now
                </span>
                {f.rating.upPercent !== null ? (
                  <span>
                    <strong>{f.rating.upPercent}%</strong> like it
                  </span>
                ) : null}
                {f.genres[0] ? <span>{genreName(f.genres[0])}</span> : null}
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
        ) : null}

        <div className={styles.side}>
          <section className={styles.continue} aria-labelledby="continue-title">
            <h2 id="continue-title" className={styles.sectionTitle}>
              {continueSection?.title ?? "Continue playing"}
            </h2>
            {continueSection && continueSection.items.length > 0 ? (
              <ul role="list" className={styles.rows}>
                {continueSection.items.map((game) => {
                  const at = lastPlayed.get(game.id);
                  return (
                    <li key={game.id}>
                      <GameRow game={game} trailing={at ? `Played ${timeAgo(at)}` : undefined} />
                    </li>
                  );
                })}
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
          {favs.length > 0 && viewer ? (
            <section className={styles.continue} aria-labelledby="favourites-title">
              <h2 id="favourites-title" className={styles.sectionTitle}>
                Your favourites
              </h2>
              <ul role="list" className={styles.rows}>
                {favs.slice(0, 4).map(({ game }) => (
                  <li key={game.id}>
                    <GameRow game={game} />
                  </li>
                ))}
              </ul>
              {favs.length > 4 ? (
                <Link href={`/users/${viewer.user.username}#favourites`} className={styles.more}>
                  All {favs.length} favourites
                </Link>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {rest.map((s) => (
        <Section key={s.id} section={s} friends={friends?.items ?? []} shell={shell} />
      ))}

      {genres.length ? (
        <section className={styles.genres} aria-labelledby="genres-title">
          <h2 id="genres-title" className={styles.sectionTitle}>
            Browse by genre
          </h2>
          <ul role="list" className={styles.genreList}>
            {genres.map((g) => (
              <li key={g.id}>
                <Link href={`/explore?genre=${g.id}`} className={`wide ${styles.genre}`}>
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Section({ section: s, friends, shell }: { section: HomeSection; friends: Friend[]; shell: Shell }) {
  if (s.items.length === 0) return null;
  const titleId = `home-${s.id}`;

  switch (s.kind) {
    case "friends_playing": {
      // The row lists games; who is in them comes from the friends list.
      const ids = new Set(s.items.map((g) => g.id));
      const here = friends.filter((fr) => fr.presence?.status === "in_game" && fr.presence.game && ids.has(fr.presence.game.id));
      if (here.length === 0) return null;
      return (
        <section className={styles.friends} aria-labelledby={titleId}>
          <div className={styles.friendsHead}>
            <h2 id={titleId} className={styles.sectionTitle}>
              {s.title}
            </h2>
            <Link href="/friends" className={styles.more}>
              All friends
            </Link>
          </div>
          <ul role="list" className={styles.friendList}>
            {here.map(({ user, presence }) => (
              <li key={user.id} className={styles.friend}>
                <Link href={`/users/${user.username}`} className={styles.friendWho}>
                  <Avatar user={user} size={44} presence={presence?.status} />
                  <span className={styles.friendText}>
                    <span className={styles.friendName}>{user.displayName}</span>
                    <span className={styles.friendGame}>{presence!.game!.name}</span>
                  </span>
                </Link>
                {presence?.joinable ? (
                  <PlayButton
                    game={presence.game!}
                    shell={shell}
                    followUserId={user.id}
                    label="Join"
                    size="small"
                    variant="secondary"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "popular":
      return (
        <section className={styles.chart} aria-labelledby={titleId}>
          <div className={styles.chartHead}>
            <h2 id={titleId} className={`wide ${styles.chartTitle}`}>
              {s.title}
            </h2>
            <p className={styles.quiet}>{s.reason}.</p>
          </div>
          <ol className={styles.chartList}>
            {s.items.map((g, i) => (
              <li key={g.id}>
                <GameRow game={g} rank={i + 1} />
              </li>
            ))}
          </ol>
          <Link href="/explore?sort=popular" className={styles.more}>
            Full list in Explore
          </Link>
        </section>
      );

    case "first_party":
      return (
        <section className={styles.firstParty} aria-labelledby={titleId}>
          <h2 id={titleId} className={styles.sectionTitle}>
            {s.title}
          </h2>
          <ul role="list" className={styles.fpList}>
            {s.items.map((g) => (
              <li key={g.id}>
                <Link href={`/games/${g.id}`} className={styles.fpItem}>
                  <span className={`milled ${styles.fpArt}`}>
                    <GamePicture game={g} />
                  </span>
                  <span className={styles.fpText}>
                    <span className={`wide ${styles.fpName}`}>{g.name}</span>
                    {g.tagline ? <span>{g.tagline}</span> : null}
                    <span className={styles.quiet}>{formatCount(g.playing)} playing now</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "new_and_rising":
      return (
        <Shelf id={titleId} title={s.title} description={`${s.reason}.`} moreHref="/explore?sort=new" moreLabel="All new games" columns={5}>
          {s.items.map((g) => (
            <li key={g.id}>
              <GameTile game={g} />
            </li>
          ))}
        </Shelf>
      );

    default:
      return (
        <Shelf id={titleId} title={s.title} description={`${s.reason}.`}>
          {s.items.map((g) => (
            <li key={g.id}>
              <GameTile game={g} />
            </li>
          ))}
        </Shelf>
      );
  }
}
