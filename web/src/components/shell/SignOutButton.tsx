"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions";
import { getBridge, invoke } from "@/lib/launcher-bridge";

/**
 * Signs out of the website and, inside the Launcher, out of the app too
 * (bridge `signOut` drops the Launcher's tokens), so the next sign-in in
 * either place starts fresh.
 */
export function SignOutButton({ className }: { className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (getBridge()) {
            // The site still signs out if the Launcher refuses or is busy.
            await invoke("signOut").catch(() => undefined);
          }
          await signOut();
        })
      }
    >
      {pending ? "Signing out" : "Sign out"}
    </button>
  );
}
