import Link from "next/link";
import type { Shell } from "@/lib/prefs";
import { Emblem } from "../Emblem";
import styles from "./Shell.module.css";

export function SiteFooter({ shell }: { shell: Shell }) {
  return (
    <footer className={styles.footer}>
      <div className={`page ${styles.footerInner}`}>
        <p className={`wide ${styles.footerMark}`}>
          <Emblem size={40} />
          Metallic
        </p>
        <ul role="list" className={styles.footerLinks}>
          <li>
            {/* Inside the app there is nothing to download it from. */}
            {shell === "launcher" ? <Link href="/downloads">Downloads</Link> : <Link href="/download">Get Metallic Play</Link>}
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
