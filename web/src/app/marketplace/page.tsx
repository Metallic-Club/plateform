import type { Metadata } from "next";
import Link from "next/link";
import { ItemTile } from "@/components/ItemTile";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import { WARDROBE_CATEGORIES, type CatalogSort, type WardrobeCategory } from "@/lib/api/types";
import { CATEGORY_LABEL } from "@/lib/format";
import styles from "./marketplace.module.css";

export const metadata: Metadata = { title: "Marketplace" };

const SORTS: { id: CatalogSort; label: string }[] = [
  { id: "relevance", label: "Best match" },
  { id: "newest", label: "Newest" },
  { id: "price_low", label: "Price, low to high" },
  { id: "price_high", label: "Price, high to low" },
];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MarketplacePage({ searchParams }: PageProps<"/marketplace">) {
  const sp = await searchParams;
  const slot = WARDROBE_CATEGORIES.includes(one(sp.category) as WardrobeCategory) ? (one(sp.category) as WardrobeCategory) : undefined;
  const sortParam = one(sp.sort);
  const sort: CatalogSort = SORTS.some((s) => s.id === sortParam) ? (sortParam as CatalogSort) : "relevance";
  const free = one(sp.free) === "1";
  const q = one(sp.q)?.trim() || undefined;

  const api = await getApi();
  const [result, viewer] = await Promise.all([api.listCatalogItems({ category: slot, sort, free: free || undefined, q }), api.getViewer()]);
  // The catalog list does not say what you own; the inventory does.
  const owned = viewer ? new Set((await api.listInventory().catch(() => null))?.items.map((i) => i.item.id)) : new Set<string>();

  const state = { category: slot, sort: sort === "relevance" ? undefined : sort, free: free ? "1" : undefined, q };
  function href(patch: Partial<Record<keyof typeof state, string | undefined>>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/marketplace?${s}` : "/marketplace";
  }

  return (
    <div className={`page ${styles.market}`}>
      <div className={styles.head}>
        <div>
          <h1 className={`wide ${styles.title}`}>Marketplace</h1>
          <p className={styles.sub}>
            Clothes and accessories made by players. Everything you buy goes straight to your{" "}
            <Link href="/wardrobe">Wardrobe</Link>.
          </p>
        </div>
        {viewer ? (
          <p className={styles.balance}>
            <span className={styles.balanceNumber}>{viewer.credits.toLocaleString("en-US")}</span> credits
            <span className={styles.balanceNote}>Sample balance</span>
          </p>
        ) : null}
      </div>

      <nav aria-label="Item type" className={styles.slots}>
        <Link href={href({ category: undefined })} className={styles.slot} aria-current={!slot ? "true" : undefined} scroll={false}>
          Everything
        </Link>
        {WARDROBE_CATEGORIES.map((s) => (
          <Link key={s} href={href({ category: s })} className={styles.slot} aria-current={slot === s ? "true" : undefined} scroll={false}>
            {CATEGORY_LABEL[s]}
          </Link>
        ))}
      </nav>

      <div className={styles.bar}>
        <form action="/marketplace" role="search" className={styles.search}>
          {slot ? <input type="hidden" name="category" value={slot} /> : null}
          <label htmlFor="market-q" className="visually-hidden">
            Search items
          </label>
          <input id="market-q" name="q" type="search" defaultValue={q} placeholder="Search items or creators" />
          <button type="submit" className={button("secondary")}>
            Search
          </button>
        </form>
        <div className={styles.options}>
          <Link href={href({ free: free ? undefined : "1" })} className={styles.toggle} data-on={free || undefined} scroll={false}>
            Free only{free ? <span className="visually-hidden"> (on, select to show all prices)</span> : null}
          </Link>
          <nav aria-label="Sort" className={styles.sorts}>
            {SORTS.map((s) => (
              <Link
                key={s.id}
                href={href({ sort: s.id === "relevance" ? undefined : s.id })}
                className={styles.sort}
                aria-current={sort === s.id ? "true" : undefined}
                scroll={false}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {result.items.length === 0 ? (
        <StateMessage
          title={q ? `No items match “${q}”` : "Nothing here yet"}
          actions={
            <Link href="/marketplace" className={button("secondary")}>
              See every item
            </Link>
          }
        >
          <p>
            {q || slot || free
              ? "Try another word, or remove the type and price filters."
              : "No items are on sale right now. Check back after the next creator drop."}
          </p>
        </StateMessage>
      ) : (
        <>
          <ul role="list" className={styles.grid}>
            {result.items.map((item) => (
              <li key={item.id}>
                <ItemTile item={item} owned={owned.has(item.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
