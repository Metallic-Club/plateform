"use client";

import { useState, type FormEvent } from "react";
import { button } from "@/components/ui/button";
import styles from "../auth.module.css";

/*
 * Sign-in form. UI only: real sign-in arrives with browser and device
 * sign-in. Submitting validates the fields and says plainly that nothing
 * was sent.
 * TODO(auth): replace with the browser/device sign-in flow.
 */
export function SignInForm({ launcher }: { launcher: boolean }) {
  const [errors, setErrors] = useState<{ id?: string; password?: string }>({});
  const [sent, setSent] = useState(false);

  if (launcher) {
    return (
      <div className={styles.form}>
        {/* TODO(launcher): the launcher should open target=_blank links in the system browser. */}
        <a href="/signin" target="_blank" rel="noopener" className={button("primary", "large")}>
          Continue in your browser
        </a>
        <p className={styles.hint}>Your browser opens. When you finish there, come back to the app.</p>
      </div>
    );
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const id = String(data.get("id") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const next: typeof errors = {};
    if (!id) next.id = "Enter your email or username.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setSent(Object.keys(next).length === 0);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor="signin-id" className={styles.label}>
          Email or username
        </label>
        <input
          id="signin-id"
          name="id"
          autoComplete="username"
          className={styles.input}
          aria-invalid={errors.id ? true : undefined}
          aria-describedby={errors.id ? "signin-id-error" : undefined}
        />
        {errors.id ? (
          <p id="signin-id-error" className={styles.error}>
            {errors.id}
          </p>
        ) : null}
      </div>
      <div className={styles.field}>
        <label htmlFor="signin-password" className={styles.label}>
          Password
        </label>
        <input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={styles.input}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "signin-password-error" : undefined}
        />
        {errors.password ? (
          <p id="signin-password-error" className={styles.error}>
            {errors.password}
          </p>
        ) : null}
      </div>
      <div className={styles.row}>
        <button type="submit" className={button("primary", "large")}>
          Sign in
        </button>
      </div>
      <p className={styles.notice} role="status" hidden={!sent}>
        Sign-in is not connected in this preview, so nothing was sent. You are browsing as a sample player.
      </p>
    </form>
  );
}
