import styles from "./Loading.module.css";

/*
 * Loading states shaped like the page they stand in for, with a plain
 * sentence saying what is loading (read by screen readers too).
 */

export function LoadingPage({ what, layout = "grid" }: { what: string; layout?: "home" | "grid" | "detail" | "profile" | "list" }) {
  return (
    <div className={`page ${styles.wrap}`} aria-busy="true">
      <p className={styles.label} role="status">
        Loading {what}…
      </p>
      {layout === "home" ? (
        <div className={styles.home}>
          <div className={`${styles.block} ${styles.hero}`} />
          <div className={styles.side}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={`${styles.block} ${styles.row}`} />
            ))}
          </div>
        </div>
      ) : null}
      {layout === "detail" ? (
        <div className={styles.detail}>
          <div className={`${styles.block} ${styles.hero}`} />
          <div className={styles.side}>
            <div className={`${styles.block} ${styles.titleBar}`} />
            <div className={`${styles.block} ${styles.line}`} />
            <div className={`${styles.block} ${styles.button}`} />
            <div className={`${styles.block} ${styles.panel}`} />
          </div>
        </div>
      ) : null}
      {layout === "profile" ? (
        <div className={styles.profile}>
          <div className={`${styles.block} ${styles.avatar}`} />
          <div className={styles.side}>
            <div className={`${styles.block} ${styles.titleBar}`} />
            <div className={`${styles.block} ${styles.line}`} />
            <div className={`${styles.block} ${styles.line}`} />
          </div>
        </div>
      ) : null}
      {layout === "list" ? (
        <div className={styles.list}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`${styles.block} ${styles.row}`} />
          ))}
        </div>
      ) : null}
      {layout === "grid" || layout === "home" ? (
        <div className={styles.grid}>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={styles.tile}>
              <div className={`${styles.block} ${styles.art}`} />
              <div className={`${styles.block} ${styles.line}`} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
