"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import styles from "./Shell.module.css";

/**
 * "Signed in as Kit (@ferro_kit). Not you?" after a Launcher handoff
 * (lib/launcher-handoff.ts adds `signedin=launcher` to the landing page).
 * If someone was signed in to an account that is not theirs, they see it at
 * once and can sign out from here. Dismissing drops the flag from the URL.
 */
export function HandoffNotice({ displayName, username }: { displayName: string; username: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  if (params.get("signedin") !== "launcher") return null;

  function dismiss() {
    const rest = new URLSearchParams(params.toString());
    rest.delete("signedin");
    const q = rest.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  return (
    <div className={`page ${styles.handoff}`} role="status">
      <p className={styles.handoffText}>
        Signed in as <strong>{displayName}</strong> (@{username}). Not you?
      </p>
      <div className={styles.handoffActions}>
        <SignOutButton className={styles.handoffSignOut} />
        <button type="button" className={styles.handoffDismiss} onClick={dismiss}>
          It’s me
        </button>
      </div>
    </div>
  );
}
