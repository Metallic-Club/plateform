import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { PlayButton } from "@/components/play/PlayButton";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import type { UserSummary } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";
import { getShell } from "@/lib/prefs.server";
import { AddFriendButton } from "../users/[username]/AddFriendButton";
import { RequestActions } from "./RequestActions";
import styles from "./friends.module.css";

export const metadata: Metadata = { title: "Friends" };

const TABS = [
  { id: "friends", label: "Friends" },
  { id: "requests", label: "Requests" },
  { id: "find", label: "Find people" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === one(sp.tab)) ? (one(sp.tab) as Tab) : "friends";
  const q = one(sp.q)?.trim() ?? "";
  const api = await getApi();
  const viewer = await api.getViewer();

  if (!viewer) {
    return (
      <div className="page" style={{ paddingBlock: "var(--s-7)" }}>
        <StateMessage
          headingLevel={1}
          title="Sign in to see your friends"
          actions={
            <Link href="/signin" className={button("primary")}>
              Sign in
            </Link>
          }
        >
          <p>Friends show up here with what they are playing, so you can join them in one step.</p>
        </StateMessage>
      </div>
    );
  }

  const [friends, requests, shell] = await Promise.all([api.listFriends(viewer.user.id), api.listFriendRequests(), getShell()]);
  const found = tab === "find" && q ? await api.searchUsers(q) : [];
  const friendIds = new Set(friends.map((f) => f.id));

  const inGame = friends.filter((f) => f.presence.status === "in-game");
  const online = friends.filter((f) => f.presence.status === "online");
  const offline = friends.filter((f) => f.presence.status === "offline");

  return (
    <div className={`page ${styles.friends}`}>
      <div className={styles.head}>
        <h1 className={`wide ${styles.title}`}>Friends</h1>
        <nav aria-label="Friends sections" className={styles.tabs}>
          {TABS.map((t) => (
            <Link key={t.id} href={t.id === "friends" ? "/friends" : `/friends?tab=${t.id}`} className={styles.tab} aria-current={tab === t.id ? "page" : undefined}>
              {t.label}
              {t.id === "friends" ? <span className={styles.tabCount}>{friends.length}</span> : null}
              {t.id === "requests" && requests.length ? <span className={styles.tabCount}>{requests.length}</span> : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "friends" ? (
        friends.length === 0 ? (
          <StateMessage
            title="No friends yet"
            actions={
              <Link href="/friends?tab=find" className={button("primary")}>
                Find people
              </Link>
            }
          >
            <p>Search for someone by username and send a request. When they accept, you will see what they are playing.</p>
          </StateMessage>
        ) : (
          <div className={styles.groups}>
            {[
              { title: "In a game", list: inGame },
              { title: "Online", list: online },
              { title: "Offline", list: offline },
            ]
              .filter((g) => g.list.length)
              .map((g) => (
                <section key={g.title} aria-label={g.title} className={styles.group}>
                  <h2 className={styles.groupTitle}>
                    {g.title} <span className={styles.groupCount}>{g.list.length}</span>
                  </h2>
                  <ul role="list" className={styles.rows}>
                    {g.list.map((f) => (
                      <FriendRow key={f.id} user={f}>
                        {f.presence.status === "in-game" ? (
                          <PlayButton
                            game={{ id: f.presence.gameId, name: f.presence.gameName }}
                            shell={shell}
                            serverId={f.presence.serverId ?? undefined}
                            label="Join"
                            size="small"
                            variant="secondary"
                          />
                        ) : null}
                      </FriendRow>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        )
      ) : null}

      {tab === "requests" ? (
        requests.length === 0 ? (
          <StateMessage title="No friend requests">
            <p>When someone sends you a request, it waits here until you accept or decline it.</p>
          </StateMessage>
        ) : (
          <ul role="list" className={styles.rows}>
            {requests.map((r) => (
              <FriendRow key={r.id} user={r.from} note={`Sent ${timeAgo(r.sentAt)}`}>
                <RequestActions name={r.from.displayName} />
              </FriendRow>
            ))}
          </ul>
        )
      ) : null}

      {tab === "find" ? (
        <div className={styles.find}>
          <form action="/friends" role="search" className={styles.search}>
            <input type="hidden" name="tab" value="find" />
            <label htmlFor="find-q" className={styles.searchLabel}>
              Username or display name
            </label>
            <div className={styles.searchRow}>
              <input id="find-q" name="q" type="search" defaultValue={q} autoComplete="off" />
              <button type="submit" className={button("secondary")}>
                Search
              </button>
            </div>
          </form>
          {q ? (
            found.length ? (
              <ul role="list" className={styles.rows}>
                {found.map((u) => (
                  <FriendRow key={u.id} user={u}>
                    <AddFriendButton isFriend={friendIds.has(u.id)} name={u.displayName} />
                  </FriendRow>
                ))}
              </ul>
            ) : (
              <StateMessage title={`Nobody matches “${q}”`}>
                <p>Check the spelling. Usernames are matched from any part, so “fjord” finds quietfjord.</p>
              </StateMessage>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function presence(u: UserSummary) {
  const p = u.presence;
  if (p.status === "in-game") return `Playing ${p.gameName}`;
  if (p.status === "online") return "Online";
  return `Last online ${timeAgo(p.lastSeenAt)}`;
}

function FriendRow({ user, note, children }: { user: UserSummary; note?: string; children?: React.ReactNode }) {
  return (
    <li className={styles.row}>
      <Link href={`/users/${user.username}`} className={styles.who}>
        <Avatar user={user} size={48} showPresence />
        <span className={styles.whoText}>
          <span className={styles.name}>{user.displayName}</span>
          <span className={styles.sub}>
            @{user.username} <span aria-hidden="true">/</span> {note ?? presence(user)}
          </span>
        </span>
      </Link>
      <div className={styles.rowActions}>{children}</div>
    </li>
  );
}
