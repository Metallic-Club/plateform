"use client";

import { useState } from "react";
import { button } from "@/components/ui/button";

/*
 * Accept or decline a request. Preview only: the answer is not sent anywhere.
 * TODO(api): POST /v1/me/friend-requests/{id}/accept and /decline.
 */
export function RequestActions({ name }: { name: string }) {
  const [answer, setAnswer] = useState<"accepted" | "declined" | null>(null);
  if (answer) {
    return (
      <p role="status" style={{ color: "var(--ink-2)", minHeight: 36, display: "flex", alignItems: "center" }}>
        {answer === "accepted" ? `You and ${name} are now friends.` : "Request declined."}
        <button type="button" className={button("quiet", "small")} onClick={() => setAnswer(null)}>
          Undo
        </button>
      </p>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" className={button("secondary", "small")} onClick={() => setAnswer("accepted")}>
        Accept
      </button>
      <button type="button" className={button("quiet", "small")} onClick={() => setAnswer("declined")}>
        Decline
      </button>
    </div>
  );
}
