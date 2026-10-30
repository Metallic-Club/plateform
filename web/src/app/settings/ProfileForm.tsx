"use client";

import { useState, type FormEvent } from "react";
import { button } from "@/components/ui/button";
import type { SocialLink, SocialPlatform } from "@/lib/api/types";
import styles from "./settings.module.css";

/** The spec allows 1000; the form asks for less so profiles stay readable. */
const BIO_MAX = 300;
const KINDS: { kind: SocialPlatform; label: string; placeholder: string }[] = [
  { kind: "discord", label: "Discord", placeholder: "Your Discord username" },
  { kind: "youtube", label: "YouTube", placeholder: "@channel" },
  { kind: "twitch", label: "Twitch", placeholder: "Your Twitch name" },
  { kind: "tiktok", label: "TikTok", placeholder: "@name" },
];

/*
 * Bio and linked accounts. Validates, then says it was not saved anywhere.
 * TODO(api): PATCH /v1/users/me for the bio, PUT /v1/users/me/social-links for links.
 * Discord can also be linked through Discord sign-in later (verified links).
 */
export function ProfileForm({ bio, links }: { bio: string; links: SocialLink[] }) {
  const [text, setText] = useState(bio);
  const [status, setStatus] = useState("");
  const left = BIO_MAX - text.length;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (left < 0) {
      setStatus(`Your bio is ${-left} characters too long.`);
      return;
    }
    setStatus("Looks good. Saving is not connected in this preview, so your profile has not changed.");
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor="bio" className={styles.label}>
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={styles.textarea}
          aria-describedby="bio-count"
          aria-invalid={left < 0 ? true : undefined}
        />
        <p id="bio-count" className={left < 0 ? styles.error : styles.note}>
          {left >= 0 ? `${left} characters left` : `${-left} characters over the limit`}
        </p>
      </div>
      <fieldset className={styles.links}>
        <legend className={styles.label}>Linked accounts</legend>
        <p className={styles.note}>Shown on your profile so people can find you elsewhere. Enter the handle only.</p>
        {KINDS.map((k) => (
          <div key={k.kind} className={styles.linkRow}>
            <label htmlFor={`link-${k.kind}`}>{k.label}</label>
            <input
              id={`link-${k.kind}`}
              name={k.kind}
              defaultValue={links.find((l) => l.platform === k.kind)?.handle ?? ""}
              placeholder={k.placeholder}
              className={styles.input}
              autoComplete="off"
            />
          </div>
        ))}
      </fieldset>
      <div>
        <button type="submit" className={button("primary")}>
          Save profile
        </button>
      </div>
      <p role="status" className={styles.note}>
        {status}
      </p>
    </form>
  );
}
