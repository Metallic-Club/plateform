"use client";

import { useState } from "react";
import { button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import styles from "./item.module.css";

/*
 * Buying asks for confirmation with the balance before and after.
 * Purchases are not connected in the preview, and the dialog says so.
 * TODO(api): POST /v1/catalog/{id}/purchase.
 */
export function BuyButton({ name, price, balance }: { name: string; price: number; balance: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const short = price > balance;
  const label = price === 0 ? "Get for free" : `Buy for ${price.toLocaleString("en-US")} credits`;

  return (
    <>
      <button type="button" className={button("primary", "large")} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setDone(false);
        }}
        title={done ? "Purchases are not switched on yet" : price === 0 ? `Get ${name}?` : `Buy ${name}?`}
      >
        {done ? (
          <>
            <p>This preview is not connected to accounts, so nothing was bought and no credits were taken.</p>
            <div className={styles.dialogActions}>
              <button type="button" className={button("secondary")} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </>
        ) : short ? (
          <>
            <p>
              {name} costs {price.toLocaleString("en-US")} credits and you have {balance.toLocaleString("en-US")}. You need{" "}
              {(price - balance).toLocaleString("en-US")} more.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={button("secondary")} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <dl className={styles.receipt}>
              <div>
                <dt>Your balance</dt>
                <dd>{balance.toLocaleString("en-US")} credits</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{price.toLocaleString("en-US")} credits</dd>
              </div>
              <div>
                <dt>After buying</dt>
                <dd>{(balance - price).toLocaleString("en-US")} credits</dd>
              </div>
            </dl>
            <div className={styles.dialogActions}>
              <button type="button" className={button("primary")} onClick={() => setDone(true)}>
                {price === 0 ? "Get it" : `Buy for ${price.toLocaleString("en-US")} credits`}
              </button>
              <button type="button" className={button("secondary")} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
