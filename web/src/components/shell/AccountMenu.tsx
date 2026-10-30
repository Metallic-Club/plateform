"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { UserSummary } from "@/lib/api/types";
import type { Theme } from "@/lib/prefs";
import { Avatar } from "../Avatar";
import { ThemePicker } from "../ThemePicker";
import styles from "./Shell.module.css";

export function AccountMenu({ user, credits, theme }: { user: UserSummary; credits: number; theme: Theme }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Close on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className={styles.account} ref={root}>
      <button
        ref={button}
        type="button"
        className={styles.accountButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar user={user} size={34} />
        <span className="visually-hidden">Account menu for {user.displayName}</span>
      </button>
      <div id={panelId} className={styles.menu} hidden={!open}>
        <Link href={`/users/${user.username}`} className={styles.menuHead}>
          <Avatar user={user} size={44} />
          <span>
            <span className={styles.menuName}>{user.displayName}</span>
            <span className={styles.menuSub}>@{user.username}</span>
          </span>
        </Link>
        <p className={styles.menuCredits}>
          {credits.toLocaleString("en-US")} credits <span className={styles.menuSub}>(sample balance)</span>
        </p>
        <ul role="list" className={styles.menuList}>
          <li>
            <Link href={`/users/${user.username}`}>Profile</Link>
          </li>
          <li>
            <Link href="/friends">Friends</Link>
          </li>
          <li>
            <Link href="/create">Create</Link>
          </li>
          <li>
            <Link href="/settings">Settings</Link>
          </li>
        </ul>
        <div className={styles.menuTheme}>
          <ThemePicker initial={theme} variant="compact" />
        </div>
        <Link href="/signin" className={styles.menuSignOut}>
          Sign out
        </Link>
      </div>
    </div>
  );
}
