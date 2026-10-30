"use client";

import { useEffect, useState, type FormEvent } from "react";
import { button } from "@/components/ui/button";
import { USERNAME_RULES, usernameProblem } from "@/lib/username";
import styles from "../auth.module.css";

type Check = { state: "idle" | "checking" | "ok" | "bad" | "unknown"; message: string };
type Errors = Partial<Record<"username" | "email" | "password" | "birth", string>>;

/*
 * Sign-up form. Checks the username as you type (rules first, then the API),
 * validates everything on submit, and says plainly that no account is made.
 * TODO(auth): POST /v1/accounts once accounts open.
 */
export function SignUpForm() {
  const [username, setUsername] = useState("");
  // The server's answer, remembered with the name it was for.
  const [remote, setRemote] = useState<{ name: string } & Check>({ name: "", state: "idle", message: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);

  const name = username.trim();
  const problem = name ? usernameProblem(name) : null;
  const check: Check = !name
    ? { state: "idle", message: USERNAME_RULES }
    : problem
      ? { state: "bad", message: problem }
      : remote.name === name
        ? remote
        : { state: "checking", message: "Checking…" };

  useEffect(() => {
    if (!name || problem) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/usernames?u=${encodeURIComponent(name)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { available: boolean | null; reason: string | null };
        if (body.available === true) setRemote({ name, state: "ok", message: `${name} is free.` });
        else if (body.available === false)
          setRemote({ name, state: "bad", message: body.reason ?? "That username is taken." });
        else setRemote({ name, state: "unknown", message: "Could not check right now. Try again in a moment." });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setRemote({ name, state: "unknown", message: "Could not check right now." });
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [name, problem]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const birth = String(data.get("birth") ?? "");
    const next: Errors = {};
    const uProblem = usernameProblem(username.trim()) ?? (check.state === "bad" ? check.message : null);
    if (uProblem) next.username = uProblem;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter an email address like name@example.com.";
    if (password.length < 10) next.password = "Use at least 10 characters.";
    if (!birth) next.birth = "Enter your date of birth.";
    else if (Date.parse(birth) > Date.now()) next.birth = "That date is in the future.";
    setErrors(next);
    setDone(Object.keys(next).length === 0);
  }

  const describe = (id: string, err?: string, hint?: boolean) =>
    [hint ? `${id}-hint` : "", err ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor="su-username" className={styles.label}>
          Username
        </label>
        <input
          id="su-username"
          name="username"
          autoComplete="username"
          spellCheck={false}
          className={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={errors.username || check.state === "bad" ? true : undefined}
          aria-describedby={describe("su-username", errors.username, true)}
        />
        <p
          id="su-username-hint"
          className={check.state === "ok" ? styles.ok : check.state === "bad" ? styles.error : styles.hint}
          aria-live="polite"
        >
          {check.message}
        </p>
        {errors.username && errors.username !== check.message ? (
          <p id="su-username-error" className={styles.error}>
            {errors.username}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor="su-email" className={styles.label}>
          Email
        </label>
        <input
          id="su-email"
          name="email"
          type="email"
          autoComplete="email"
          className={styles.input}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe("su-email", errors.email, true)}
        />
        <p id="su-email-hint" className={styles.hint}>
          We send a link to verify it.
        </p>
        {errors.email ? (
          <p id="su-email-error" className={styles.error}>
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor="su-password" className={styles.label}>
          Password
        </label>
        <input
          id="su-password"
          name="password"
          type="password"
          autoComplete="new-password"
          className={styles.input}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describe("su-password", errors.password, true)}
        />
        <p id="su-password-hint" className={styles.hint}>
          At least 10 characters.
        </p>
        {errors.password ? (
          <p id="su-password-error" className={styles.error}>
            {errors.password}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor="su-birth" className={styles.label}>
          Date of birth
        </label>
        <input
          id="su-birth"
          name="birth"
          type="date"
          autoComplete="bday"
          className={styles.input}
          aria-invalid={errors.birth ? true : undefined}
          aria-describedby={describe("su-birth", errors.birth, true)}
        />
        <p id="su-birth-hint" className={styles.hint}>
          Not shown on your profile.
        </p>
        {errors.birth ? (
          <p id="su-birth-error" className={styles.error}>
            {errors.birth}
          </p>
        ) : null}
      </div>

      <div className={styles.row}>
        <button type="submit" className={button("primary", "large")}>
          Create account
        </button>
      </div>
      <p className={styles.notice} role="status" hidden={!done}>
        Everything checks out. Accounts are not open in this preview, so no account was created and nothing was sent.
      </p>
    </form>
  );
}
