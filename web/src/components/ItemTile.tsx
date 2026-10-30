import Link from "next/link";
import type { CatalogItem } from "@/lib/api/types";
import { ItemArtView } from "./AvatarFigure";
import styles from "./ItemTile.module.css";

export function formatPrice(price: number) {
  return price === 0 ? "Free" : `${price.toLocaleString("en-US")} credits`;
}

export function ItemTile({ item }: { item: CatalogItem }) {
  return (
    <Link href={`/marketplace/${item.id}`} className={styles.tile}>
      <span className={`milled ${styles.art}`}>
        <ItemArtView art={item.art} />
      </span>
      <span className={styles.name}>{item.name}</span>
      <span className={styles.creator}>by {item.creator.name}</span>
      <span className={styles.price}>{item.owned ? "Owned" : formatPrice(item.price)}</span>
    </Link>
  );
}
