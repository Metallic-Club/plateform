"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "../Icon";
import styles from "./Shell.module.css";

/** Header search. A plain GET form to /explore, so it works before hydration. Press / to focus. */
export function SearchField() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = pathname === "/explore" ? (params.get("q") ?? "") : "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      action="/explore"
      className={styles.search}
      onSubmit={(e) => {
        e.preventDefault();
        const value = input.current?.value.trim() ?? "";
        router.push(value ? `/explore?q=${encodeURIComponent(value)}` : "/explore");
      }}
    >
      <label htmlFor="site-search" className="visually-hidden">
        Search games
      </label>
      <Icon name="search" size={18} className={styles.searchIcon} />
      <input
        ref={input}
        id="site-search"
        key={q}
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search games"
        autoComplete="off"
        enterKeyHint="search"
        className={styles.searchInput}
        title="Search games (press / to focus)"
      />
    </form>
  );
}
