"use client";

import { useState, type FormEvent } from "react";
import { button } from "@/components/ui/button";
import styles from "../../auth.module.css";

/*
 * Device pairing code entry. UI only.
 * TODO(auth): POST /v1/oauth/device/approve with { userCode, approve: true }.
 */
export function CodeForm() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "")
      .replace(/[\s-]/g, "")
      .toUpperCase();
    // The spec's user_code: 8 consonants, shown as two groups of four.
    if (!/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/.test(code)) {
      setError("Codes are 8 letters in two groups of four, like BDFG-KLMN.");
      setDone(false);
      return;
    }
    setError("");
    setDone(true);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor="pair-code" className={styles.label}>
          Code
        </label>
        <input
          id="pair-code"
          name="code"
          className={styles.codeInput}
          placeholder="BDFG-KLMN"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "pair-code-error" : undefined}
        />
        {error ? (
          <p id="pair-code-error" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
      <div className={styles.row}>
        <button type="submit" className={button("primary", "large")}>
          Pair device
        </button>
      </div>
      <p className={styles.notice} role="status" hidden={!done}>
        Pairing is not connected in this preview, so the other device was not signed in.
      </p>
    </form>
  );
}
