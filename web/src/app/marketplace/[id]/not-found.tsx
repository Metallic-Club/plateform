import Link from "next/link";
import { StateMessage } from "@/components/StateMessage";
import { button } from "@/components/ui/button";

export default function ItemNotFound() {
  return (
    <div className="page" style={{ paddingBlock: "var(--s-7)" }}>
      <StateMessage
        headingLevel={1}
        title="This item is no longer on sale"
        actions={
          <Link href="/marketplace" className={button("primary")}>
            Back to the Marketplace
          </Link>
        }
      >
        <p>Its creator may have taken it off sale, or the link is wrong.</p>
      </StateMessage>
    </div>
  );
}
