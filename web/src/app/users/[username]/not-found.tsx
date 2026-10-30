import Link from "next/link";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";

export default function UserNotFound() {
  return (
    <div className="page" style={{ paddingBlock: "var(--s-7)" }}>
      <StateMessage
        headingLevel={1}
        title="No player has this username"
        actions={
          <Link href="/friends?tab=find" className={button("primary")}>
            Find people
          </Link>
        }
      >
        <p>Check the spelling, or search by name on the Friends page.</p>
      </StateMessage>
    </div>
  );
}
