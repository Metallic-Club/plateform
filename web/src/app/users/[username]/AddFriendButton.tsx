"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { button } from "@/components/ui/button";

/*
 * Friend request button. Preview only: the request is not sent anywhere.
 * TODO(api): POST /v1/me/friend-requests.
 */
export function AddFriendButton({ isFriend, name }: { isFriend: boolean; name: string }) {
  const [sent, setSent] = useState(false);
  if (isFriend) {
    return (
      <p style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontWeight: 600 }}>
        <Icon name="check" /> Friends
      </p>
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
