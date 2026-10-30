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
import type { SocialPlatform } from "@/lib/api/types";
import { formatDate, presenceText } from "@/lib/format";
import { getShell } from "@/lib/prefs.server";
import { AddFriendButton } from "./AddFriendButton";
import styles from "./profile.module.css";

const SOCIAL_LABEL: Record<SocialPlatform, string> = {
  discord: "Discord",
  youtube: "YouTube",
  twitch: "Twitch",
  tiktok: "TikTok",
  x: "X",
  bluesky: "Bluesky",
  instagram: "Instagram",
  github: "GitHub",
};

export async function generateMetadata({ params }: PageProps<"/users/[username]">): Promise<Metadata> {
  const { username } = await params;
  try {
    const user = await (await getApi()).getUserByUsername(decodeURIComponent(username));
    return { title: user ? `${user.displayName} (@${user.username})` : "Player not found" };
  } catch {
    return { title: "Profile" };
  }
}

export default async function ProfilePage({ params }: PageProps<"/users/[username]">) {
  const { username } = await params;
  const api = await getApi();
  const user = await api.getUserByUsername(decodeURIComponent(username));
  if (!user) notFound();
  const isMe = user.relationship === "self";
  const [avatar, friends, favorites, shell] = await Promise.all([
    api.getUserAvatar(user.id).catch(() => null),
    api.listFriends(user.id).catch(() => null),
    // The spec only lists the signed-in player's own favourites.
    isMe ? api.listFavorites() : Promise.resolve(null),
    getShell(),
  ]);
  const look = user.look;
  const p = user.presence;
  const canJoin = !isMe && p?.status === "in_game" && p.joinable && p.game;

  return (
    <div className={`page ${styles.profile}`}>
      <section className={styles.head} aria-labelledby="profile-name">
        <div className={`milled ${styles.stage}`}>
          {look ? (
            <AvatarFigure look={look} className={styles.figure} label={`${user.displayName}'s avatar`} />
          ) : avatar?.fullBodyUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- CDN render
            <img src={avatar.fullBodyUrl} alt={`${user.displayName}'s avatar`} className={styles.figure} />
          ) : null}
        </div>
        <div className={styles.identity}>
          <h1 id="profile-name" className={`wide ${styles.name}`}>
            {user.displayName}
          </h1>
          <p className={styles.handle}>
            @{user.username}
            {user.isFirstParty ? <span className={styles.team}>Metallic team</span> : null}
          </p>
          {p ? (
            <p className={styles.presence} data-status={p.status}>
              {presenceText(p)}
            </p>
          ) : null}
          {user.bio ? (
            <p className={styles.bio}>{user.bio}</p>
          ) : isMe ? (
            <p className={styles.quiet}>You have not written a bio yet.</p>
          ) : null}

          {user.socialLinks.length ? (
            <ul role="list" className={styles.links} aria-label="Linked accounts">
              {user.socialLinks.map((l) => (
                <li key={l.platform}>
                  {l.url ? (
                    <a href={l.url} rel="me noopener noreferrer" target="_blank" className={styles.link}>
                      <span className={styles.linkKind}>{SOCIAL_LABEL[l.platform]}</span>
                      <span className={styles.linkHandle}>{l.handle}</span>
                      <Icon name="external" size={16} />
                      <span className="visually-hidden">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className={styles.link}>
                      <span className={styles.linkKind}>{SOCIAL_LABEL[l.platform]}</span>
                      <span className={styles.linkHandle}>{l.handle}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <div className={styles.actions}>
            {isMe ? (
              <Link href="/settings#profile" className={button("secondary")}>
                Edit profile
              </Link>
            ) : user.relationship ? (
              <AddFriendButton relationship={user.relationship} name={user.displayName} />
            ) : null}
            {canJoin ? (
              <PlayButton
                game={{ id: p.game!.id, name: p.game!.name }}
                shell={shell}
                followUserId={user.id}
                label={`Join in ${p.game!.name}`}
              />
            ) : null}
          </div>

          <dl className={styles.stats}>
            <div>
              <dt>Friends</dt>
              <dd>{user.friendCount}</dd>
            </div>
            {favorites ? (
              <div>
                <dt>Favourites</dt>
                <dd>{favorites.items.length}</dd>
              </div>
            ) : null}
            <div>
              <dt>Joined</dt>
              <dd>{formatDate(user.createdAt)}</dd>
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
        {!friends ? (
          <p className={styles.quiet}>{user.displayName} keeps their friends list private.</p>
        ) : friends.items.length ? (
          <ul role="list" className={styles.friendGrid}>
            {friends.items.slice(0, 12).map((f) => (
              <li key={f.user.id}>
                <Link href={`/users/${f.user.username}`} className={styles.friend}>
                  <Avatar user={f.user} size={64} presence={f.presence?.status} />
                  <span className={styles.friendName}>{f.user.displayName}</span>
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

      {favorites ? (
        <div id="favourites">
          {favorites.items.length ? (
            <Shelf id="fav-title" title="Your favourite games" columns={5}>
              {favorites.items.map((f) => (
                <li key={f.game.id}>
                  <GameTile game={f.game} />
                </li>
              ))}
            </Shelf>
          ) : (
            <section aria-labelledby="fav-empty" className={styles.friends}>
              <h2 id="fav-empty" className={styles.h2}>
                Your favourite games
              </h2>
              <p className={styles.quiet}>Games you favourite appear here. Only you can see this list.</p>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
