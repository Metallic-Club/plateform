"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { GetMetallicButton } from "@/components/play/GetMetallicButton";
import { Icon } from "@/components/Icon";
import { button } from "@/components/ui/button";
import type { GameServer, Region, UserSummary } from "@/lib/api/types";
import { REGION_LABEL } from "@/lib/format";
import { playHref } from "@/lib/links";
import type { Shell } from "@/lib/prefs";
import styles from "./servers.module.css";

type Sort = "ping" | "most" | "fewest";

function pingWord(ms: number) {
  if (ms < 60) return "Good";
  if (ms < 130) return "Fair";
  return "Slow";
}

export function ServerBrowser({
  game,
  servers,
  total,
  friends,
  shell,
}: {
  game: { id: string; name: string };
  servers: GameServer[];
  total: number;
  friends: Record<string, UserSummary>;
  shell: Shell;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [region, setRegion] = useState<Region | "all">("all");
  const [hideFull, setHideFull] = useState(true);
  const [sort, setSort] = useState<Sort>("ping");

  const regions = useMemo(() => [...new Set(servers.map((s) => s.region))], [servers]);
  const list = useMemo(() => {
    let l = servers.filter((s) => (region === "all" || s.region === region) && (!hideFull || s.players < s.capacity));
    l = [...l].sort((a, b) => {
      const friendDiff = b.friendIds.length - a.friendIds.length;
      if (friendDiff) return friendDiff;
      if (sort === "most") return b.players - a.players;
      if (sort === "fewest") return a.players - b.players;
      return a.pingMs - b.pingMs;
    });
    return l;
  }, [servers, region, hideFull, sort]);

  const fullCount = servers.filter((s) => s.players >= s.capacity).length;

  return (
    <div className={styles.browser}>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span>Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value as Region | "all")}>
            <option value="all">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {REGION_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="ping">Lowest ping</option>
            <option value="most">Most players</option>
            <option value="fewest">Fewest players</option>
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={hideFull} onChange={(e) => setHideFull(e.target.checked)} />
          <span>Hide full servers{fullCount ? ` (${fullCount})` : ""}</span>
        </label>
        <button
          type="button"
          className={button("quiet", "small")}
          onClick={() => startRefresh(() => router.refresh())}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh list"}
        </button>
        {servers.length > 0 ? (
          <p className={styles.scope}>
            {servers.length < total
              ? `The ${servers.length} servers nearest to you, out of ${total.toLocaleString("en-US")} running.`
              : `All ${total} running ${total === 1 ? "server" : "servers"}.`}{" "}
            Servers with friends come first.
          </p>
        ) : null}
      </div>

      {servers.length === 0 ? (
        <p className={styles.empty}>
          No servers are running. Press Play and Metallic starts a new one for you.
        </p>
      ) : list.length === 0 ? (
        <p className={styles.empty}>
          No servers match these filters.{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setRegion("all");
              setHideFull(false);
            }}
          >
            Show all {servers.length}
          </button>
        </p>
      ) : (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Servers for {game.name}. Servers with friends come first.
          </caption>
          <thead>
            <tr>
              <th scope="col">Server</th>
              <th scope="col">Players</th>
              <th scope="col">Ping</th>
              <th scope="col">Friends</th>
              <th scope="col">
                <span className="visually-hidden">Join</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((s, i) => {
              const isFull = s.players >= s.capacity;
              const fill = Math.round((s.players / s.capacity) * 100);
              const here = s.friendIds.map((id) => friends[id]).filter(Boolean);
              return (
                <tr key={s.id}>
                  <th scope="row" className={styles.serverName}>
                    {REGION_LABEL[s.region]}
                    <span className={styles.serverId}>Server {i + 1}</span>
                  </th>
                  <td>
                    <span className={styles.players}>
                      <span className={styles.bar} aria-hidden="true">
                        <span style={{ width: `${fill}%` }} data-full={isFull || undefined} />
                      </span>
                      <span>
                        {s.players} of {s.capacity}
                        {isFull ? <span className={styles.fullTag}> full</span> : null}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.ping} data-quality={pingWord(s.pingMs).toLowerCase()}>
                      <Icon name="signal" size={16} />
                      {s.pingMs} ms <span className={styles.pingWord}>{pingWord(s.pingMs)}</span>
                    </span>
                  </td>
                  <td>
                    {here.length ? (
                      <span className={styles.friends}>
                        {here.map((f) => (
                          <Avatar key={f.id} user={f} size={28} />
                        ))}
                        <span className="visually-hidden">{here.map((f) => f.displayName).join(", ")}</span>
                        <span className={styles.friendNames} aria-hidden="true">
                          {here.map((f) => f.displayName).join(", ")}
                        </span>
                      </span>
                    ) : (
                      <span className={styles.none}>None</span>
                    )}
                  </td>
                  <td className={styles.joinCell}>
                    {isFull ? (
                      <span className={styles.none}>Full</span>
                    ) : shell === "launcher" ? (
                      <a href={playHref(game.id, s.id)} className={button("secondary", "small")}>
                        Join
                      </a>
                    ) : (
                      <JoinFromBrowser game={game} serverId={s.id} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function JoinFromBrowser({ game, serverId }: { game: { id: string; name: string }; serverId: string }) {
  return <GetMetallicButton gameName={game.name} href={playHref(game.id, serverId)} size="small" label="Join" variant="secondary" />;
}
