import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameTile } from "@/components/GameTile";
import { PlayButton } from "@/components/play/PlayButton";
import { Shelf } from "@/components/Shelf";
import { getApi } from "@/lib/api";
import type { RegionCode, ServerSort } from "@/lib/api/types";
import { CONTENT_LABEL, formatCompact, formatDate, genreName, PLATFORM_LABEL } from "@/lib/format";
import { getShell } from "@/lib/prefs.server";
import { Gallery } from "./Gallery";
import { LivePlayers } from "./LivePlayers";
import { Reactions } from "./Reactions";
import { ServerBrowser } from "./ServerBrowser";
import styles from "./game.module.css";

export async function generateMetadata({ params }: PageProps<"/games/[id]">): Promise<Metadata> {
  const { id } = await params;
  try {
    const game = await (await getApi()).getGame(id);
    return game ? { title: game.name, description: game.tagline ?? game.description.slice(0, 160) } : { title: "Game not found" };
  } catch {
    return { title: "Game" };
  }
}

const SERVER_SORTS: ServerSort[] = ["most_players", "fewest_players", "newest"];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function GamePage({ params, searchParams }: PageProps<"/games/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const api = await getApi();
  const game = await api.getGame(id);
  if (!game) notFound();

  const regions = await api.listRegions();
  const region = regions.some((r) => r.code === one(sp.region)) ? (one(sp.region) as RegionCode) : undefined;
  const sort = SERVER_SORTS.includes(one(sp.sort) as ServerSort) ? (one(sp.sort) as ServerSort) : "most_players";
  const hideFull = one(sp.full) !== "show";

  const [servers, live, similar, rating, shell] = await Promise.all([
    api.listServers(id, { region, sort, hideFull, limit: 12 }),
    api.getLiveCounts([id]),
    api.listSimilarGames(id, 6),
    api.getRating(id),
    getShell(),
  ]);
  const count = live[0] ?? { gameId: id, playing: game.playing, servers: 0, updatedAt: new Date().toISOString() };
  const join = one(sp.join);
  const pictures = game.gallery?.length
    ? game.gallery.map((art) => ({ art }))
    : game.screenshots.map((src) => ({ src }));

  return (
    <div className={`page ${styles.game}`}>
      <div className={styles.top}>
        <Gallery name={game.name} items={pictures.length ? pictures : [{ src: game.thumbnailUrl }]} />

        <section className={styles.info} aria-labelledby="game-title">
          <h1 id="game-title" className={`wide ${styles.title}`}>
            {game.name}
          </h1>
          <p className={styles.by}>
            by <span className={styles.creator}>{game.creator.name}</span>
          </p>

          <LivePlayers initial={count} />

          <div className={styles.playRow}>
            <PlayButton game={game} shell={shell} size="large" block />
            {join ? (
              <p className={styles.joinError} role="alert">
                {join === "full"
                  ? "That server filled up before you got in. Pick another, or press Play to be placed in one."
                  : "Metallic could not get you into a server just now. Try again in a moment."}
              </p>
            ) : null}
            {game.friendsPlaying.length ? (
              <p className={styles.friendsHere}>
                {game.friendsPlaying.map((f) => f.displayName).join(" and ")}{" "}
                {game.friendsPlaying.length === 1 ? "is" : "are"} playing. See their server below.
              </p>
            ) : null}
          </div>

          <Reactions gameId={game.id} rating={rating} favorites={game.favorites} viewer={game.viewer} />
        </section>
      </div>

      <section className={styles.about} aria-labelledby="about-title">
        <div className={styles.aboutText}>
          <h2 id="about-title" className={styles.h2}>
            About {game.name}
          </h2>
          <div className={styles.prose}>
            {game.description.split(/\n{2,}/).map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
          </div>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>{game.genres.length > 1 ? "Genres" : "Genre"}</dt>
            <dd>
              {game.genres.map((g, i) => (
                <span key={g}>
                  {i ? ", " : null}
                  <Link href={`/explore?genre=${g}`}>{genreName(g)}</Link>
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Server size</dt>
            <dd>Up to {game.maxPlayersPerServer} players</dd>
          </div>
          <div>
            <dt>Plays on</dt>
            <dd>{game.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}</dd>
          </div>
          <div>
            <dt>Content</dt>
            <dd>{CONTENT_LABEL[game.contentLabel]}</dd>
          </div>
          <div>
            <dt>Visits</dt>
            <dd>{formatCompact(game.visits)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatDate(game.updatedAt)}</dd>
          </div>
          <div>
            <dt>Released</dt>
            <dd>{formatDate(game.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.servers} aria-labelledby="servers-title" id="servers">
        <h2 id="servers-title" className={styles.h2}>
          Servers
        </h2>
        <p className={styles.sub}>Pick a server to join a region or a friend. Play on its own puts you in the best one.</p>
        <ServerBrowser
          game={{ id: game.id, name: game.name }}
          servers={servers.items}
          more={Boolean(servers.nextCursor)}
          running={count.servers}
          regions={regions}
          filters={{ region, sort, hideFull }}
          shell={shell}
        />
      </section>

      {similar.items.length ? (
        <div id="similar">
          <Shelf id="similar-title" title={`More like ${game.name}`} description="Played by the same people, or in the same genre.">
            {similar.items.map((g) => (
              <li key={g.id}>
                <GameTile game={g} />
              </li>
            ))}
          </Shelf>
        </div>
      ) : null}
    </div>
  );
}
