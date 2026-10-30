"use client";

import { useState, type FormEvent } from "react";
import { button } from "@/components/ui/button";
import type { Settings } from "@/lib/api/types";
import styles from "./settings.module.css";

type Privacy = Settings["privacy"];

const AUDIENCE = [
  { value: "everyone", label: "Everyone" },
  { value: "friends", label: "Friends" },
  { value: "nobody", label: "Nobody" },
] as const;

const GROUPS: { key: keyof Privacy; legend: string; options: readonly { value: string; label: string }[] }[] = [
  { key: "presenceVisibility", legend: "Who can see when you are online and what you play", options: AUDIENCE },
  { key: "joinPolicy", legend: "Who can join you in a game", options: AUDIENCE },
  {
    key: "friendRequests",
    legend: "Who can send you friend requests",
    options: [
      { value: "everyone", label: "Everyone" },
      { value: "friends_of_friends", label: "Friends of friends" },
      { value: "nobody", label: "Nobody" },
    ],
  },
  { key: "socialLinksVisibility", legend: "Who can see your linked accounts", options: AUDIENCE },
];

/*
 * The spec's privacy settings. Validates nothing (every combination is
 * allowed) and says plainly that it is not saved.
 * TODO(api): PATCH /v1/users/me/settings with { privacy }.
 */
export function PrivacyForm({ initial }: { initial: Privacy }) {
  const [privacy, setPrivacy] = useState<Privacy>(initial);
  const [status, setStatus] = useState("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("Saving is not connected in this preview, so your privacy settings have not changed.");
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.privacyGrid}>
        {GROUPS.map((g) => (
          <fieldset key={g.key} className={styles.segmented}>
            <legend className={styles.label}>{g.legend}</legend>
            <div className={styles.segments}>
              {g.options.map((o) => (
                <label key={o.value} className={styles.segment}>
                  <input
                    type="radio"
                    name={g.key}
                    value={o.value}
                    checked={privacy[g.key] === o.value}
                    onChange={() => setPrivacy((p) => ({ ...p, [g.key]: o.value }))}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div>
        <button type="submit" className={button("secondary")}>
          Save privacy settings
        </button>
      </div>
      <p role="status" className={styles.note}>
        {status}
      </p>
    </form>
  );
}
