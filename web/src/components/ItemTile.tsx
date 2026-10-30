import Link from "next/link";
import type { CatalogItemSummary, Price } from "@/lib/api/types";
import { ItemArtView } from "./AvatarFigure";
import styles from "./ItemTile.module.css";

export function formatPrice(price: Price | null) {
  if (!price) return "Not for sale";
  return price.amount === 0 ? "Free" : `${price.amount.toLocaleString("en-US")} credits`;
}

/** One item. `owned` comes from the viewer's inventory; the catalog list does not carry it. */
export function ItemTile({ item, owned = false }: { item: CatalogItemSummary; owned?: boolean }) {
  return (
    <Link href={`/marketplace/${item.id}`} className={styles.tile}>
      <span className={`milled ${styles.art}`}>
        {item.art ? (
          <ItemArtView art={item.art} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- CDN thumbnails
          <img src={item.thumbnailUrl} alt="" loading="lazy" />
        )}
      </span>
      <span className={styles.name}>{item.name}</span>
      <span className={styles.creator}>by {item.creator.name}</span>
      <span className={styles.price}>{owned ? "Owned" : formatPrice(item.price)}</span>
    </Link>
  );
}
