"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { PlayButton } from "@/components/play/PlayButton";
import { button } from "@/components/ui/button";
import type { Region, RegionCode, Server, ServerSort } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";
import type { Shell } from "@/lib/prefs";
import styles from "./servers.module.css";

const SORT_LABEL: Record<ServerSort, string> = {
  most_players: "Most players",
  fewest_players: "Fewest players",
  newest: "Newest",
};

/*
 * Server browser for GET /v1/games/{id}/servers. Filters live in the URL and
 * the server applies them, as the spec does; with JavaScript they apply on
 * change, without it the Apply button submits the form.
 * Ping is not shown: Metallic Play measures it from your computer.
 */
export function ServerBrowser({
  game,
  servers,
  more,
  running,
  regions,
  filters,
  shell,
}: {
  game: { id: string; name: string };
  servers: Server[];
  more: boolean;
  running: number;
  regions: Region[];
  filters: { region?: RegionCode; sort: ServerSort; hideFull: boolean };
  shell: Shell;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const regionName = new Map(regions.map((r) => [r.code, r.name]));

  function apply(form: HTMLFormElement) {
    const data = new FormData(form);
    const q = new URLSearchParams();
    const region = String(data.get("region") ?? "");
    const sort = String(data.get("sort") ?? "");
    if (region) q.set("region", region);
    if (sort && sort !== "most_players") q.set("sort", sort);
    if (!data.get("full")) q.set("full", "show");
    const s = q.toString();
    start(() => router.replace(`${pathname}${s ? `?${s}` : ""}#servers`, { scroll: false }));
  }

  const filtered = Boolean(filters.region) || !filters.hideFull;

  return (
    <div className={styles.browser} aria-busy={pending}>
      <form
        className={styles.controls}
        action={`${pathname}#servers`}
        onChange={(e) => apply(e.currentTarget)}
        onSubmit={(e) => {
          e.preventDefault();
          apply(e.currentTarget);
        }}
      >
        <label className={styles.field}>
          <span>Region</span>
          <select name="region" defaultValue={filters.region ?? ""}>
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Sort by</span>
          <select name="sort" defaultValue={filters.sort}>
            {(Object.keys(SORT_LABEL) as ServerSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="full" value="hide" defaultChecked={filters.hideFull} />
          <span>Hide full servers</span>
        </label>
        <noscript>
          <button type="submit" className={button("secondary", "small")}>
            Apply
          </button>
        </noscript>
        <button
          type="button"
          className={button("quiet", "small")}
          onClick={() => start(() => router.refresh())}
          disabled={pending}
        >
          {pending ? "Updating…" : "Refresh list"}
        </button>
        {running > 0 ? (
          <p className={styles.scope}>
            {running.toLocaleString("en-US")} {running === 1 ? "server" : "servers"} running
            {more || servers.length < running ? `, showing ${servers.length}` : ""}. Servers with friends come first.
          </p>
        ) : null}
      </form>

      {servers.length === 0 ? (
        <p className={styles.empty}>
          {filtered
            ? "No servers match these filters. Choose All regions or show full servers."
            : "No servers are running. Press Play and Metallic starts a new one for you."}
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
              <th scope="col">Running</th>
              <th scope="col">Friends</th>
              <th scope="col">
                <span className="visually-hidden">Join</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s, i) => {
              const fill = Math.round((s.playing / s.maxPlayers) * 100);
              const full = s.playing >= s.maxPlayers;
              return (
                <tr key={s.id}>
                  <th scope="row" className={styles.serverName}>
                    {regionName.get(s.region) ?? s.region}
                    <span className={styles.serverId}>Server {i + 1}</span>
                  </th>
                  <td>
                    <span className={styles.players}>
                      <span className={styles.bar} aria-hidden="true">
                        <span style={{ width: `${fill}%` }} data-full={full || undefined} />
                      </span>
                      <span>
                        {s.playing} of {s.maxPlayers}
                        {full ? <span className={styles.fullTag}> full</span> : null}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.uptime}>Started {timeAgo(s.startedAt)}</span>
                  </td>
                  <td>
                    {s.friends.length ? (
                      <span className={styles.friends}>
                        {s.friends.map((f) => (
                          <Avatar key={f.id} user={f} size={28} />
                        ))}
                        <span className={styles.friendNames}>{s.friends.map((f) => f.displayName).join(", ")}</span>
                      </span>
                    ) : (
                      <span className={styles.none}>None</span>
                    )}
                  </td>
                  <td className={styles.joinCell}>
                    {s.joinable ? (
                      <PlayButton game={game} shell={shell} serverId={s.id} label="Join" size="small" variant="quiet" />
                    ) : (
                      <span className={styles.none}>{full ? "Full" : "Closing"}</span>
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
