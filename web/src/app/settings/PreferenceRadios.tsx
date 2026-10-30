"use client";

import { useState, useTransition } from "react";
import { setPreference } from "@/app/actions";
import { setRootData } from "@/lib/dom";
import type { COOKIES } from "@/lib/prefs";
import styles from "./settings.module.css";

/** A radio group bound to one preference cookie. The page re-renders with the new value. */
export function PreferenceRadios({
  kind,
  legend,
  current,
  options,
}: {
  kind: Exclude<keyof typeof COOKIES, "theme">;
  legend: string;
  current: string;
  options: { value: string; label: string; note: string }[];
}) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  return (
    <fieldset className={styles.radios} aria-busy={pending}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={styles.radio}>
          <input
            type="radio"
            name={kind}
            value={o.value}
            checked={value === o.value}
            onChange={() => {
              setValue(o.value);
              if (kind === "display") setRootData("display", o.value);
              start(() => setPreference(kind, o.value));
            }}
          />
          <span>
            <span className={styles.radioLabel}>{o.label}</span>
            <span className={styles.radioNote}>{o.note}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
