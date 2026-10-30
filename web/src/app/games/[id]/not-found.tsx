import Link from "next/link";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";

export default function GameNotFound() {
  return (
    <div className="page" style={{ paddingBlock: "var(--s11)" }}>
      <StateMessage
        headingLevel={1}
        title="This game is not on Metallic"
        actions={
          <>
            <Link href="/explore" className={button("primary")}>
              Search games
            </Link>
            <Link href="/" className={button("secondary")}>
              Go to Home
            </Link>
          </>
        }
      >
        <p>Its creator may have taken it down or made it private, or the link has a typo. Search by name to find it.</p>
      </StateMessage>
    </div>
  );
}
