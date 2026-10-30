import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { PlayButton } from "@/components/play/PlayButton";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import type { Friend, Presence, UserSummary } from "@/lib/api/types";
import { presenceText, timeAgo } from "@/lib/format";
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
      <div className="page" style={{ paddingBlock: "var(--s11)" }}>
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

  const [friends, requests, shell] = await Promise.all([
    api.listFriends(viewer.user.id),
    api.listFriendRequests("incoming"),
    getShell(),
  ]);
  const tooShort = tab === "find" && q.length > 0 && q.length < 3;
  const found = tab === "find" && q.length >= 3 ? (await api.searchUsers(q)).items : [];
  const friendIds = new Set(friends.items.map((f) => f.user.id));
  const requestIds = new Set(requests.items.map((r) => r.user.id));

  const by = (status: Presence["status"][]) => friends.items.filter((f) => status.includes(f.presence?.status ?? "offline"));
  const groups: { title: string; list: Friend[] }[] = [
    { title: "In a game", list: by(["in_game"]) },
    { title: "Online", list: by(["online", "in_studio"]) },
    { title: "Offline", list: by(["offline"]) },
  ];

  return (
    <div className={`page ${styles.friends}`}>
      <div className={styles.head}>
        <h1 className={`wide ${styles.title}`}>Friends</h1>
        <nav aria-label="Friends sections" className={styles.tabs}>
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.id === "friends" ? "/friends" : `/friends?tab=${t.id}`}
              className={styles.tab}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.label}
              {t.id === "friends" ? <span className={styles.tabCount}>{friends.items.length}</span> : null}
              {t.id === "requests" && requests.items.length ? (
                <span className={styles.tabCount}>{requests.items.length}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "friends" ? (
        friends.items.length === 0 ? (
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
            {groups
              .filter((g) => g.list.length)
              .map((g) => (
                <section key={g.title} aria-label={g.title} className={styles.group}>
                  <h2 className={styles.groupTitle}>
                    {g.title} <span className={styles.groupCount}>{g.list.length}</span>
                  </h2>
                  <ul role="list" className={styles.rows}>
                    {g.list.map((f) => (
                      <FriendRow key={f.user.id} user={f.user} presence={f.presence}>
                        {f.presence?.status === "in_game" && f.presence.game && f.presence.joinable ? (
                          <PlayButton
                            game={f.presence.game}
                            shell={shell}
                            followUserId={f.user.id}
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
        requests.items.length === 0 ? (
          <StateMessage title="No friend requests">
            <p>When someone sends you a request, it waits here until you accept or decline it.</p>
          </StateMessage>
        ) : (
          <ul role="list" className={styles.rows}>
            {requests.items.map((r) => (
              <FriendRow
                key={r.id}
                user={r.user}
                note={`Sent ${timeAgo(r.createdAt)}${r.mutualFriends ? `, ${r.mutualFriends} friends in common` : ""}`}
              >
                <RequestActions name={r.user.displayName} />
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
              <input
                id="find-q"
                name="q"
                type="search"
                defaultValue={q}
                autoComplete="off"
                minLength={3}
                maxLength={32}
                aria-describedby="find-hint"
              />
              <button type="submit" className={button("secondary")}>
                Search
              </button>
            </div>
            <p id="find-hint" className={styles.hint}>
              At least 3 characters.
            </p>
          </form>
          {tooShort ? (
            <StateMessage title="Type at least 3 characters">
              <p>Short searches match too many people, so search starts at 3 characters.</p>
            </StateMessage>
          ) : q && !tooShort ? (
            found.length ? (
              <ul role="list" className={styles.rows}>
                {found.map((u) => (
                  <FriendRow key={u.id} user={u}>
                    <AddFriendButton
                      relationship={friendIds.has(u.id) ? "friend" : requestIds.has(u.id) ? "request_received" : "none"}
                      name={u.displayName}
                    />
                  </FriendRow>
                ))}
              </ul>
            ) : (
              <StateMessage title={`Nobody matches “${q}”`}>
                <p>Check the spelling. Names match from any part, so “fjord” finds quietfjord.</p>
              </StateMessage>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FriendRow({
  user,
  presence,
  note,
  children,
}: {
  user: UserSummary;
  presence?: Presence;
  note?: string;
  children?: React.ReactNode;
}) {
  const line = note ?? presenceText(presence);
  return (
    <li className={styles.row}>
      <Link href={`/users/${user.username}`} className={styles.who}>
        <Avatar user={user} size={48} presence={presence?.status} />
        <span className={styles.whoText}>
          <span className={styles.name}>{user.displayName}</span>
          <span className={styles.sub}>
            @{user.username}
            {line ? (
              <>
                {" "}
                <span aria-hidden="true">/</span> {line}
              </>
            ) : null}
          </span>
        </span>
      </Link>
      <div className={styles.rowActions}>{children}</div>
    </li>
  );
}
