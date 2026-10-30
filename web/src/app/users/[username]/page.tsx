import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { AvatarFigure } from "@/components/AvatarFigure";
import { GameTile } from "@/components/GameTile";
import { Icon } from "@/components/Icon";
import { PlayButton } from "@/components/play/PlayButton";
import { Shelf } from "@/components/Shelf";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import type { SocialKind, UserPresence } from "@/lib/api/types";
import { formatDate, timeAgo } from "@/lib/format";
import { getShell } from "@/lib/prefs.server";
import { AddFriendButton } from "./AddFriendButton";
import styles from "./profile.module.css";

const SOCIAL_LABEL: Record<SocialKind, string> = {
  discord: "Discord",
  youtube: "YouTube",
  twitch: "Twitch",
  tiktok: "TikTok",
  website: "Website",
};

export async function generateMetadata({ params }: PageProps<"/users/[username]">): Promise<Metadata> {
  const { username } = await params;
  try {
    const user = await (await getApi()).getUser(username);
    return { title: user ? `${user.displayName} (@${user.username})` : "Player not found" };
  } catch {
    return { title: "Profile" };
  }
}

function presenceText(p: UserPresence) {
  if (p.status === "in-game") return `Playing ${p.gameName}`;
  if (p.status === "online") return "Online";
  return `Last online ${timeAgo(p.lastSeenAt)}`;
}

export default async function ProfilePage({ params }: PageProps<"/users/[username]">) {
  const { username } = await params;
  const api = await getApi();
  const user = await api.getUser(decodeURIComponent(username));
  if (!user) notFound();
  const [viewer, friends, favourites, shell] = await Promise.all([
    api.getViewer(),
    api.listFriends(user.id),
    api.listFavourites(user.id),
    getShell(),
  ]);
  const isMe = viewer?.user.id === user.id;
  const viewerFriends = viewer && !isMe ? await api.listFriends(viewer.user.id) : [];
  const isFriend = viewerFriends.some((f) => f.id === user.id);
  const p = user.presence;

  return (
    <div className={`page ${styles.profile}`}>
      <section className={styles.head} aria-labelledby="profile-name">
        <div className={`milled ${styles.stage}`}>
          <AvatarFigure look={user.avatar} className={styles.figure} label={`${user.displayName}'s avatar`} />
        </div>
        <div className={styles.identity}>
          <h1 id="profile-name" className={`wide ${styles.name}`}>
            {user.displayName}
          </h1>
          <p className={styles.handle}>@{user.username}</p>
          <p className={styles.presence} data-status={p.status}>
            {presenceText(p)}
          </p>
          {user.bio ? <p className={styles.bio}>{user.bio}</p> : isMe ? <p className={styles.quiet}>You have not written a bio yet.</p> : null}

          {user.links.length ? (
            <ul role="list" className={styles.links} aria-label="Linked accounts">
              {user.links.map((l) => (
                <li key={l.kind}>
                  <a href={l.url} rel="me noopener noreferrer" target="_blank" className={styles.link}>
                    <span className={styles.linkKind}>{SOCIAL_LABEL[l.kind]}</span>
                    <span className={styles.linkHandle}>{l.handle}</span>
                    <Icon name="external" size={16} />
                    <span className="visually-hidden">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={styles.actions}>
            {isMe ? (
              <Link href="/settings#profile" className={button("secondary")}>
                Edit profile
              </Link>
            ) : viewer ? (
              <AddFriendButton isFriend={isFriend} name={user.displayName} />
            ) : null}
            {p.status === "in-game" && !isMe ? (
              <PlayButton
                game={{ id: p.gameId, name: p.gameName }}
                shell={shell}
                serverId={p.serverId ?? undefined}
                label={`Join in ${p.gameName}`}
              />
            ) : null}
          </div>

          <dl className={styles.stats}>
            <div>
              <dt>Friends</dt>
              <dd>{user.friendCount}</dd>
            </div>
            <div>
              <dt>Favourites</dt>
              <dd>{favourites.length}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{formatDate(user.joinedAt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.friends} aria-labelledby="friends-title">
        <div className={styles.sectionHead}>
          <h2 id="friends-title" className={styles.h2}>
            Friends
          </h2>
          {isMe ? (
            <Link href="/friends" className={styles.more}>
              Manage friends
            </Link>
          ) : null}
        </div>
        {friends.length ? (
          <ul role="list" className={styles.friendGrid}>
            {friends.slice(0, 12).map((f) => (
              <li key={f.id}>
                <Link href={`/users/${f.username}`} className={styles.friend}>
                  <Avatar user={f} size={64} showPresence />
                  <span className={styles.friendName}>{f.displayName}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.quiet}>
            {isMe ? "No friends yet. Find people by username on the Friends page." : `${user.displayName} has no friends listed.`}
          </p>
        )}
      </section>

      <div id="favourites">
        {favourites.length ? (
          <Shelf id="fav-title" title="Favourite games" columns={5}>
            {favourites.map((g) => (
              <li key={g.id}>
                <GameTile game={g} />
              </li>
            ))}
          </Shelf>
        ) : (
          <section aria-labelledby="fav-empty" className={styles.friends}>
            <h2 id="fav-empty" className={styles.h2}>
              Favourite games
            </h2>
            <p className={styles.quiet}>
              {isMe ? "Games you favourite appear here and on your profile." : "No favourites yet."}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
