import Link from "next/link";
import type { Viewer } from "@/lib/api/types";
import type { Shell, Theme } from "@/lib/prefs";
import { Emblem } from "../Emblem";
import { Icon } from "../Icon";
import { AccountMenu } from "./AccountMenu";
import { LauncherStatusSlot } from "./LauncherStatus";
import { NavLinks } from "./NavLinks";
import { SearchField } from "./SearchField";
import styles from "./Shell.module.css";

export function SiteHeader({ viewer, shell, theme }: { viewer: Viewer | null; shell: Shell; theme: Theme }) {
  return (
    <header className={styles.header}>
      <div className={`page ${styles.headerInner}`}>
        <Link href="/" className={styles.brand}>
          <Emblem size={28} />
          <span className={`wide ${styles.wordmark}`}>Metallic</span>
        </Link>
        <nav aria-label="Main" className={styles.navWrap}>
          <NavLinks />
        </nav>
        <SearchField />
        <div className={styles.headerEnd}>
          {shell === "launcher" ? (
            <>
              <LauncherStatusSlot />
              <Link href="/downloads" className={styles.iconLink}>
                <Icon name="download" />
                <span className="visually-hidden">Downloads</span>
              </Link>
            </>
          ) : null}
          <Link href="/explore" className={`${styles.iconLink} ${styles.phoneOnly}`}>
            <Icon name="search" />
            <span className="visually-hidden">Search games</span>
          </Link>
          <Link href="/create" className={styles.textLink}>
            Create
          </Link>
          {viewer ? (
            <>
              <Link href="/friends" className={styles.iconLink}>
                <Icon name="friends" />
                <span className="visually-hidden">Friends</span>
              </Link>
              <AccountMenu user={viewer.user} credits={viewer.credits} theme={theme} />
            </>
          ) : (
            <Link href="/signin" className={styles.signIn}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
