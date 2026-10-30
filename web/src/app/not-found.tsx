import Link from "next/link";
import { button } from "@/components/ui/button";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={`page ${styles.wrap}`}>
      <p className={`wide ${styles.code}`} aria-hidden="true">
        404
      </p>
      <h1 className={styles.title}>Nothing is at this address</h1>
      <p className={styles.text}>
        The link may be old, or the game, item or person it pointed to has been removed or renamed. Search for it, or
        start again from Home.
      </p>
      <div className={styles.actions}>
        <Link href="/explore" className={button("primary")}>
          Search games
        </Link>
        <Link href="/" className={button("secondary")}>
          Go to Home
        </Link>
      </div>
    </div>
  );
}
