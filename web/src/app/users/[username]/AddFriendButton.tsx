"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { button } from "@/components/ui/button";
import type { Relationship } from "@/lib/api/types";

/*
 * The friend action for a profile or search result, from the spec's
 * Relationship. Preview only: nothing is sent.
 * TODO(api): POST /v1/friends/requests, POST .../accept, DELETE /v1/friends/{userId}.
 */
export function AddFriendButton({ relationship, name }: { relationship: Relationship; name: string }) {
  const [sent, setSent] = useState(relationship === "request_sent");
  const [accepted, setAccepted] = useState(false);

  if (relationship === "self" || relationship === "blocked") return null;
  if (relationship === "friend" || accepted) {
    return (
      <p style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontWeight: 600 }}>
        <Icon name="check" /> Friends
      </p>
    );
  }
  if (relationship === "request_received") {
    return (
      <>
        <button type="button" className={button("secondary")} onClick={() => setAccepted(true)}>
          <Icon name="check" size={18} />
          Accept friend request
        </button>
        <span role="status" className="visually-hidden">
          {accepted ? `You and ${name} are now friends.` : ""}
        </span>
      </>
    );
  }
  return (
    <>
      <button type="button" className={button("secondary")} onClick={() => setSent(!sent)} aria-pressed={sent}>
        <Icon name={sent ? "check" : "plus"} size={18} />
        {sent ? "Request sent" : "Add friend"}
      </button>
      <span role="status" className="visually-hidden">
        {sent ? `Friend request sent to ${name}.` : ""}
      </span>
    </>
  );
}
