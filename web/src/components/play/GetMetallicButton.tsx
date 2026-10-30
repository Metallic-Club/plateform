"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../Icon";
import { button, type ButtonSize, type ButtonVariant } from "../ui/button";
import { Dialog } from "../ui/Dialog";
import styles from "./play.module.css";

/**
 * Browser version of Play. Games run in the desktop app, so this explains
 * that, offers to open the app if it is installed, and links to the download.
 */
export function GetMetallicButton({
  gameName,
  href,
  size = "regular",
  label = "Play",
  block = false,
  variant = "primary",
}: {
  gameName: string;
  href: string;
  size?: ButtonSize;
  label?: string;
  block?: boolean;
  variant?: ButtonVariant;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={button(variant, size, block)} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="play" size={size === "large" ? 20 : 16} />
        {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Play ${gameName} in the Metallic app`}>
        <p className={styles.dialogText}>
          Games run in the Metallic app on your computer. If it is installed, open it from here and {gameName} starts
          straight away.
        </p>
        <div className={styles.dialogActions}>
          <a href={href} rel="nofollow" className={button("primary")}>
            Open in Metallic
          </a>
          <Link href="/download" className={button("secondary")}>
            <Icon name="download" size={18} />
            Get Metallic
          </Link>
        </div>
        <p className={styles.dialogNote}>Your browser may ask before it opens the app the first time.</p>
      </Dialog>
    </>
  );
}
