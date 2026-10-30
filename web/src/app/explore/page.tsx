import type { Metadata } from "next";
import Link from "next/link";
import { GameTile } from "@/components/GameTile";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import { DEVICES, GENRES, type Device, type GameQuery, type Genre, type PartySize } from "@/lib/api/types";
import { DEVICE_LABEL, GENRE_LABEL, PARTY_LABEL } from "@/lib/format";
import styles from "./explore.module.css";

export const metadata: Metadata = { title: "Explore" };

const SORTS = [
  { id: "playing", label: "Most played" },
  { id: "rating", label: "Best rated" },
  { id: "new", label: "Newest" },
  { id: "updated", label: "Recently updated" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

const PARTIES = Object.keys(PARTY_LABEL) as PartySize[];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim() || undefined;
  const genre = GENRES.includes(one(sp.genre) as Genre) ? (one(sp.genre) as Genre) : undefined;
  const party = PARTIES.includes(one(sp.party) as PartySize) ? (one(sp.party) as PartySize) : undefined;
  const device = DEVICES.includes(one(sp.device) as Device) ? (one(sp.device) as Device) : undefined;
  const sort: Sort = SORTS.some((s) => s.id === one(sp.sort)) ? (one(sp.sort) as Sort) : "playing";
  const limit = Math.min(96, Math.max(24, Number(one(sp.show)) || 24));

  const query: GameQuery = { q, genre, party, device, sort, limit };
  const result = await (await getApi()).searchGames(query);

  const state = { q, genre, party, device, sort: sort === "playing" ? undefined : sort };
  function href(patch: Partial<Record<keyof typeof state, string | undefined>>) {
    const next = { ...state, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/explore?${s}` : "/explore";
  }

  const activeCount = [genre, party, device].filter(Boolean).length;
  const heading = genre ? GENRE_LABEL[genre] : q ? `Results for “${q}”` : "Explore";

  const filters = (
    <>
      <FilterGroup title="Genre">
        <FilterLink href={href({ genre: undefined })} active={!genre}>
          Any genre
        </FilterLink>
        {GENRES.map((g) => (
          <FilterLink key={g} href={href({ genre: genre === g ? undefined : g })} active={genre === g}>
            {GENRE_LABEL[g]}
          </FilterLink>
        ))}
      </FilterGroup>
      <FilterGroup title="Who you play with">
        <FilterLink href={href({ party: undefined })} active={!party}>
          Anyone
        </FilterLink>
        {PARTIES.map((p) => (
          <FilterLink key={p} href={href({ party: party === p ? undefined : p })} active={party === p}>
            {PARTY_LABEL[p]}
          </FilterLink>
        ))}
      </FilterGroup>
      <FilterGroup title="Plays on">
        <FilterLink href={href({ device: undefined })} active={!device}>
          Any device
        </FilterLink>
        {DEVICES.map((d) => (
          <FilterLink key={d} href={href({ device: device === d ? undefined : d })} active={device === d}>
            {DEVICE_LABEL[d]}
          </FilterLink>
        ))}
      </FilterGroup>
    </>
  );

  return (
    <div className={`page ${styles.explore}`}>
      <div className={styles.head}>
        <h1 className={`wide ${styles.title}`}>{heading}</h1>
        <form action="/explore" role="search" className={styles.search}>
          <label htmlFor="explore-q" className="visually-hidden">
            Search games
          </label>
          <input id="explore-q" name="q" type="search" defaultValue={q} placeholder="Name, creator or tag" className={styles.searchInput} />
          {genre ? <input type="hidden" name="genre" value={genre} /> : null}
          {party ? <input type="hidden" name="party" value={party} /> : null}
          {device ? <input type="hidden" name="device" value={device} /> : null}
          <button type="submit" className={button("secondary")}>
            Search
          </button>
        </form>
      </div>

      <div className={styles.body}>
        <aside className={styles.filters} aria-label="Filters">
          <details className={styles.filterDrawer}>
            <summary className={styles.filterSummary}>
              Filters{activeCount ? ` (${activeCount} on)` : ""}
            </summary>
            <div className={styles.filterInner}>{filters}</div>
          </details>
          <div className={styles.filterStatic}>{filters}</div>
        </aside>

        <section className={styles.results} aria-labelledby="results-count">
          <div className={styles.resultsBar}>
            <p id="results-count" className={styles.count} aria-live="polite">
              {result.total} {result.total === 1 ? "game" : "games"}
              {activeCount || q ? (
                <>
                  {" "}
                  <Link href="/explore" className={styles.clear}>
                    Clear all
                  </Link>
                </>
              ) : null}
            </p>
            <nav aria-label="Sort" className={styles.sorts}>
              {SORTS.map((s) => (
                <Link
                  key={s.id}
                  href={href({ sort: s.id === "playing" ? undefined : s.id })}
                  className={styles.sort}
                  aria-current={sort === s.id ? "true" : undefined}
                >
                  {s.label}
                </Link>
              ))}
            </nav>
          </div>

          {result.items.length === 0 ? (
            <StateMessage
              title={q ? `No games match “${q}”` : "No games match these filters"}
              actions={
                <Link href="/explore" className={button("secondary")}>
                  Clear search and filters
                </Link>
              }
            >
              <p>
                {activeCount
                  ? "Try removing a filter. Each one narrows the list further."
                  : "Check the spelling, or search for a genre or a creator instead."}
              </p>
            </StateMessage>
          ) : (
            <>
              <ul role="list" className={styles.grid}>
                {result.items.map((g) => (
                  <li key={g.id}>
                    <GameTile game={g} />
                  </li>
                ))}
              </ul>
              {result.next ? (
                <Link href={`${href({})}${href({}).includes("?") ? "&" : "?"}show=${limit + 24}`} className={button("secondary")} scroll={false}>
                  Show more games
                </Link>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <ul role="list" className={styles.groupList}>
        {children}
      </ul>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className={styles.filter} aria-current={active ? "true" : undefined} scroll={false}>
        {children}
      </Link>
    </li>
  );
}
