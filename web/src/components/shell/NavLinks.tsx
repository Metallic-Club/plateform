"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../Icon";
import styles from "./Shell.module.css";

export const MAIN_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "explore" },
  { href: "/wardrobe", label: "Wardrobe", icon: "wardrobe" },
  { href: "/marketplace", label: "Marketplace", icon: "marketplace" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/explore" && pathname.startsWith("/games/"));
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul role="list" className={styles.nav}>
      {MAIN_NAV.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className={styles.navLink} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.tabbar} aria-label="Main">
      <ul role="list">
        {MAIN_NAV.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={styles.tab} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
