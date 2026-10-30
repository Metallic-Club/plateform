import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameTile } from "@/components/GameTile";
import { PlayButton } from "@/components/play/PlayButton";
import { Shelf } from "@/components/Shelf";
import { getApi } from "@/lib/api";
import type { UserSummary } from "@/lib/api/types";
import { DEVICE_LABEL, formatCompact, formatDate, GENRE_LABEL, SESSION_LABEL } from "@/lib/format";
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
    return game ? { title: game.name, description: game.tagline } : { title: "Game not found" };
  } catch {
    return { title: "Game" };
  }
}

export default async function GamePage({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  const api = await getApi();
  const game = await api.getGame(id);
  if (!game) notFound();

  const [servers, presence, similar, viewer, shell] = await Promise.all([
    api.listServers(id),
    api.getPresence(id),
    api.getSimilarGames(id),
    api.getViewer(),
    getShell(),
  ]);
  const friendList = viewer ? await api.listFriends(viewer.user.id) : [];
  const friends: Record<string, UserSummary> = Object.fromEntries(friendList.map((f) => [f.id, f]));
  const friendsHere = friendList.filter((f) => f.presence.status === "in-game" && f.presence.gameId === id);

  return (
    <div className={`page ${styles.game}`}>
      <div className={styles.top}>
        <Gallery name={game.name} images={game.gallery} />

        <section className={styles.info} aria-labelledby="game-title">
          <h1 id="game-title" className={`wide ${styles.title}`}>
            {game.name}
          </h1>
          <p className={styles.by}>
            by <span className={styles.creator}>{game.creator.name}</span>
          </p>

          <LivePlayers initial={presence} />

          <div className={styles.playRow}>
            <PlayButton game={game} shell={shell} size="large" block />
            {friendsHere.length ? (
              <p className={styles.friendsHere}>
                {friendsHere.map((f) => f.displayName).join(" and ")} {friendsHere.length === 1 ? "is" : "are"} playing.
                See their server below.
              </p>
            ) : null}
          </div>

          <Reactions gameId={game.id} rating={game.rating} favourites={game.favourites} />
        </section>
      </div>

      <section className={styles.about} aria-labelledby="about-title">
        <div className={styles.aboutText}>
          <h2 id="about-title" className={styles.h2}>
            About {game.name}
          </h2>
          <div className={styles.prose}>
            {game.description.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
          <ul role="list" className={styles.tags} aria-label="Tags">
            {game.tags.map((t) => (
              <li key={t}>
                <Link href={`/explore?q=${encodeURIComponent(t)}`}>{t}</Link>
              </li>
            ))}
          </ul>
        </div>
          <dl className={styles.facts}>
            <div>
              <dt>Genre</dt>
              <dd>
                <Link href={`/explore?genre=${game.genre}`}>{GENRE_LABEL[game.genre]}</Link>
              </dd>
            </div>
            <div>
              <dt>Server size</dt>
              <dd>Up to {game.maxPlayersPerServer} players</dd>
            </div>
            <div>
              <dt>A session</dt>
              <dd>{SESSION_LABEL[game.sessionLength]}</dd>
            </div>
            <div>
              <dt>Plays on</dt>
              <dd>{game.devices.map((d) => DEVICE_LABEL[d]).join(", ")}</dd>
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
        <ServerBrowser game={{ id: game.id, name: game.name }} servers={servers} total={presence.servers} friends={friends} shell={shell} />
      </section>

      {similar.length ? (
        <div id="similar">
          <Shelf id="similar-title" title={`More like ${game.name}`} description="Same genre or the same kind of session.">
            {similar.map((g) => (
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
