import type { Metadata } from "next";
import Link from "next/link";
import { GameTile } from "@/components/GameTile";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import type { DeviceHint, GameSort, GameSummary, Page } from "@/lib/api/types";
import { DEVICE_LABEL, genreName } from "@/lib/format";
import styles from "./explore.module.css";

export const metadata: Metadata = { title: "Explore" };

const SORTS: { id: GameSort; label: string }[] = [
  { id: "popular", label: "Most played" },
  { id: "top_rated", label: "Best rated" },
  { id: "trending", label: "Trending" },
  { id: "new", label: "Newest" },
  { id: "recently_updated", label: "Recently updated" },
];

/** The spec filters by the largest server a game runs (maxPlayers). */
const SIZES = [
  { id: "8", label: "Up to 8 players" },
  { id: "24", label: "Up to 24 players" },
] as const;
const DEVICES = Object.keys(DEVICE_LABEL) as DeviceHint[];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/*
 * Explore. Browsing uses GET /v1/games (genre, size, device, first party,
 * sort); a search uses GET /v1/games/search, which takes a query and a genre.
 * Every filter is a link, so the page works without JavaScript.
 */
export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim() || undefined;
  const api = await getApi();
  const genres = await api.listGenres();
  const genre = genres.some((g) => g.id === one(sp.genre)) ? one(sp.genre) : undefined;
  const size = SIZES.find((x) => x.id === one(sp.size))?.id;
  const device = DEVICES.includes(one(sp.device) as DeviceHint) ? (one(sp.device) as DeviceHint) : undefined;
  const mine = one(sp.metallic) === "1" ? "1" : undefined;
  const sort: GameSort = SORTS.some((x) => x.id === one(sp.sort)) ? (one(sp.sort) as GameSort) : "popular";
  const limit = Math.min(96, Math.max(24, Number(one(sp.show)) || 24));

  const result: Page<GameSummary> = q
    ? await api.searchGames({ q, genre, limit })
    : await api.listGames({
        genre,
        sort,
        limit,
        device,
        firstParty: mine ? true : undefined,
        maxPlayers: size ? Number(size) : undefined,
      });

  const state = { q, genre, size, device, metallic: mine, sort: sort === "popular" ? undefined : sort };
  function href(patch: Partial<Record<keyof typeof state, string | undefined>>) {
    const next = { ...state, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/explore?${s}` : "/explore";
  }

  const activeCount = [genre, ...(q ? [] : [size, device, mine])].filter(Boolean).length;
  const genreLabel = genre ? (genres.find((g) => g.id === genre)?.name ?? genreName(genre)) : undefined;
  const heading = q ? `Results for “${q}”` : (genreLabel ?? "Explore");
  const more = href({});

  const filters = (
    <>
      <FilterGroup title="Genre">
        <FilterLink href={href({ genre: undefined })} active={!genre}>
          Any genre
        </FilterLink>
        {genres.map((g) => (
          <FilterLink key={g.id} href={href({ genre: genre === g.id ? undefined : g.id })} active={genre === g.id}>
            {g.name}
          </FilterLink>
        ))}
      </FilterGroup>
      {q ? (
        <p className={styles.searchNote}>Server size, device and sorting apply when browsing. Clear the search to use them.</p>
      ) : (
        <>
          <FilterGroup title="Server size">
            <FilterLink href={href({ size: undefined })} active={!size}>
              Any size
            </FilterLink>
            {SIZES.map((x) => (
              <FilterLink key={x.id} href={href({ size: size === x.id ? undefined : x.id })} active={size === x.id}>
                {x.label}
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
          <FilterGroup title="Made by">
            <FilterLink href={href({ metallic: undefined })} active={!mine}>
              Anyone
            </FilterLink>
            <FilterLink href={href({ metallic: mine ? undefined : "1" })} active={Boolean(mine)}>
              Metallic
            </FilterLink>
          </FilterGroup>
        </>
      )}
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
          <input
            id="explore-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={80}
            placeholder="Name, creator or tag"
            className={styles.searchInput}
          />
          {genre ? <input type="hidden" name="genre" value={genre} /> : null}
          <button type="submit" className={button("secondary")}>
            Search
          </button>
        </form>
      </div>

      <div className={styles.body}>
        <aside className={styles.filters} aria-label="Filters">
          <details className={styles.filterDrawer}>
            <summary className={styles.filterSummary}>Filters{activeCount ? ` (${activeCount} on)` : ""}</summary>
            <div className={styles.filterInner}>{filters}</div>
          </details>
          <div className={styles.filterStatic}>{filters}</div>
        </aside>

        <section className={styles.results} aria-label="Games">
          <div className={styles.resultsBar}>
            <p className={styles.count}>
              {q ? "Best matches first" : `Sorted by ${SORTS.find((x) => x.id === sort)!.label.toLowerCase()}`}
              {activeCount || q ? (
                <>
                  {" "}
                  <Link href="/explore" className={styles.clear}>
                    Clear all
                  </Link>
                </>
              ) : null}
            </p>
            {q ? null : (
              <nav aria-label="Sort" className={styles.sorts}>
                {SORTS.map((x) => (
                  <Link
                    key={x.id}
                    href={href({ sort: x.id === "popular" ? undefined : x.id })}
                    className={styles.sort}
                    aria-current={sort === x.id ? "true" : undefined}
                  >
                    {x.label}
                  </Link>
                ))}
              </nav>
            )}
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
              {result.nextCursor ? (
                <Link href={`${more}${more.includes("?") ? "&" : "?"}show=${limit + 24}`} className={button("secondary")} scroll={false}>
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
