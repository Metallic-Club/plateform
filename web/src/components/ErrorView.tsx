"use client";

import Link from "next/link";
import { useEffect } from "react";
import { StateMessage } from "./StateMessage";
import { button } from "./ui/button";

/** Shared body for error.tsx files: what failed, and two ways forward. */
export function ErrorView({
  error,
  reset,
  what,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  what: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page" style={{ paddingBlock: "var(--s11)" }}>
      <StateMessage
        tone="error"
        headingLevel={1}
        title={`${what} did not load`}
        actions={
          <>
            <button type="button" className={button("primary")} onClick={reset}>
              Try again
            </button>
            <Link href="/" className={button("secondary")}>
              Go to Home
            </Link>
          </>
        }
      >
        <p>
          Metallic could not reach its servers, so this page has nothing to show yet. Try again in a moment, or head back
          to Home.
        </p>
        {error.digest ? <p>Error reference: {error.digest}</p> : null}
      </StateMessage>
    </div>
  );
}
