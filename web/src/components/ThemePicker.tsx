"use client";

import { useState, useTransition } from "react";
import { setPreference } from "@/app/actions";
import { THEMES, type Theme } from "@/lib/prefs";
import styles from "./ThemePicker.module.css";

function current(): Theme {
  if (typeof document === "undefined") return "graphite";
  return (document.documentElement.dataset.theme as Theme) ?? "graphite";
}

/** Radio group of themes. Applies instantly, then stores the choice in a cookie. */
export function ThemePicker({ initial, variant = "full" }: { initial: Theme; variant?: "full" | "compact" }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [, startTransition] = useTransition();

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    startTransition(() => setPreference("theme", next));
  }

  return (
    <fieldset className={styles.group} data-variant={variant}>
      <legend className={variant === "compact" ? styles.legendCompact : styles.legend}>Theme</legend>
      <div className={styles.options}>
        {THEMES.map((t) => (
          <label key={t.id} className={styles.option}>
            <input
              type="radio"
              name={`theme-${variant}`}
              value={t.id}
              checked={(theme ?? current()) === t.id}
              onChange={() => choose(t.id)}
              className={styles.input}
            />
            <span className={styles.swatch} data-theme={t.id} aria-hidden="true">
              <span className={styles.swGround} />
              <span className={styles.swSurface} />
              <span className={styles.swAccent} />
            </span>
            <span className={styles.text}>
              <span className={styles.name}>{t.name}</span>
              {variant === "full" ? <span className={styles.note}>{t.note}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
