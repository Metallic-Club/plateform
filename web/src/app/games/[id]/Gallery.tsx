"use client";

import { useState } from "react";
import { GameArt } from "@/components/GameArt";
import type { GameArt as Art } from "@/lib/api/types";
import styles from "./game.module.css";

type Picture = { art: Art } | { src: string };

function Show({ item, label }: { item: Picture; label?: string }) {
  if ("art" in item) return <GameArt art={item.art} label={label} />;
  // eslint-disable-next-line @next/next/no-img-element -- CDN screenshots
  return <img src={item.src} alt={label ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}

/** Large picture with thumbnails below. Thumbnails are real buttons. */
export function Gallery({ name, items }: { name: string; items: Picture[] }) {
  const [index, setIndex] = useState(0);
  return (
    <div className={styles.gallery}>
      <div className={`milled ${styles.galleryMain}`}>
        <Show item={items[index]} label={`${name}, picture ${index + 1} of ${items.length}`} />
      </div>
      {items.length > 1 ? (
        <ul role="list" className={styles.thumbs}>
          {items.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                className={styles.thumb}
                aria-pressed={i === index}
                aria-label={`Show picture ${i + 1}`}
                onClick={() => setIndex(i)}
              >
                <Show item={item} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
