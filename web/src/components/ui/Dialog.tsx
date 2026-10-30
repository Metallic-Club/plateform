"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "../Icon";
import styles from "./dialog.module.css";

/**
 * Native modal dialog: focus is trapped and Escape closes it by the platform.
 * Clicking the backdrop also closes it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 id="dialog-title" className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose}>
            <Icon name="close" />
            <span className="visually-hidden">Close</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
