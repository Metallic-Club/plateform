import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Shelf.module.css";

/** A titled row of items. Scrolls sideways on phones, wraps to a grid on wider screens. */
export function Shelf({
  id,
  title,
  description,
  moreHref,
  moreLabel,
  children,
  columns = 6,
}: {
  id: string;
  title: ReactNode;
  description?: string;
  moreHref?: string;
  moreLabel?: string;
  children: ReactNode;
  columns?: 4 | 5 | 6;
}) {
  return (
    <section className={styles.shelf} aria-labelledby={id}>
      <div className={styles.head}>
        <div>
          <h2 id={id} className={styles.title}>
            {title}
          </h2>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {moreHref ? (
          <Link href={moreHref} className={styles.more}>
            {moreLabel ?? "See all"}
          </Link>
        ) : null}
      </div>
      <ul role="list" className={styles.items} data-columns={columns}>
        {children}
      </ul>
    </section>
  );
}
