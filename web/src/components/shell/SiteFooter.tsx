import Link from "next/link";
import { Emblem } from "../Emblem";
import styles from "./Shell.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`page ${styles.footerInner}`}>
        <p className={`wide ${styles.footerMark}`}>
          <Emblem size={40} />
          Metallic
        </p>
        <ul role="list" className={styles.footerLinks}>
          <li>
            <Link href="/download">Get Metallic</Link>
          </li>
          <li>
            <Link href="/create">Create with Studio</Link>
          </li>
          <li>
            <Link href="/settings">Settings and themes</Link>
          </li>
        </ul>
        <p className={styles.footerNote}>
          Preview build. Every game, player, price and number on this site is sample data made for design work.
        </p>
      </div>
    </footer>
  );
}
