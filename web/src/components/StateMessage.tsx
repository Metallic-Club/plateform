import type { ReactNode } from "react";
import styles from "./StateMessage.module.css";

/**
 * Empty, error and not-found states. Each says what happened and offers the
 * one action that moves the person forward.
 */
export function StateMessage({
  title,
  children,
  actions,
  tone = "empty",
  headingLevel = 2,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: "empty" | "error";
  headingLevel?: 1 | 2 | 3;
}) {
  const H = `h${headingLevel}` as const;
  return (
    <div className={styles.state} data-tone={tone} role={tone === "error" ? "alert" : undefined}>
      <H className={styles.title}>{title}</H>
      {children ? <div className={styles.body}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
