import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarFigure, ItemArtView } from "@/components/AvatarFigure";
import { formatPrice } from "@/components/ItemTile";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import { formatDate, SLOT_LABEL } from "@/lib/format";
import { BuyButton } from "./BuyButton";
import styles from "./item.module.css";

export async function generateMetadata({ params }: PageProps<"/marketplace/[id]">): Promise<Metadata> {
  const { id } = await params;
  try {
    const item = await (await getApi()).getCatalogItem(id);
    return { title: item ? item.name : "Item not found" };
  } catch {
    return { title: "Marketplace" };
  }
}

export default async function ItemPage({ params }: PageProps<"/marketplace/[id]">) {
  const { id } = await params;
  const api = await getApi();
  const item = await api.getCatalogItem(id);
  if (!item) notFound();
  const viewer = await api.getViewer();
  const avatar = viewer ? await api.getAvatar() : null;
  const tryOn = avatar ? { ...avatar, equipped: { ...avatar.equipped, [item.art.slot]: { ...item.art, itemId: item.id } } } : null;

  return (
    <div className={`page ${styles.item}`}>
      <Link href={`/marketplace?slot=${item.art.slot}`} className={styles.back}>
        All {SLOT_LABEL[item.art.slot].toLowerCase()}
      </Link>
      <div className={styles.layout}>
        <div className={styles.pictures}>
          <div className={`milled ${styles.art}`}>
            <ItemArtView art={item.art} label={item.name} />
          </div>
          {tryOn ? (
            <figure className={`milled ${styles.tryOn}`}>
              <AvatarFigure look={tryOn} className={styles.tryFigure} label={`Your avatar wearing ${item.name}`} />
              <figcaption>On your avatar</figcaption>
            </figure>
          ) : null}
        </div>
        <section className={styles.info} aria-labelledby="item-title">
          <h1 id="item-title" className={`wide ${styles.title}`}>
            {item.name}
          </h1>
          <p className={styles.by}>
            by <strong>{item.creator.name}</strong>
          </p>
          <p className={styles.price}>{formatPrice(item.price)}</p>
          {item.owned ? (
            <div className={styles.owned}>
              <p>You own this.</p>
              <Link href="/wardrobe" className={button("primary")}>
                Wear it in Wardrobe
              </Link>
            </div>
          ) : viewer ? (
            <BuyButton name={item.name} price={item.price} balance={viewer.credits} />
          ) : (
            <Link href="/signin" className={button("primary")}>
              Sign in to buy
            </Link>
          )}
          <p className={styles.description}>{item.description}</p>
          <dl className={styles.facts}>
            <div>
              <dt>Type</dt>
              <dd>{SLOT_LABEL[item.art.slot]}</dd>
            </div>
            <div>
              <dt>On sale since</dt>
              <dd>{formatDate(item.createdAt)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
