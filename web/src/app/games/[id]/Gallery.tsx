"use client";

import { useState } from "react";
import { GameArt } from "@/components/GameArt";
import type { GameArt as Art } from "@/lib/api/types";
import styles from "./game.module.css";

/** Large picture with thumbnails below. Thumbnails are real buttons. */
export function Gallery({ name, images }: { name: string; images: Art[] }) {
  const [index, setIndex] = useState(0);
  return (
    <div className={styles.gallery}>
      <div className={`milled ${styles.galleryMain}`}>
        <GameArt art={images[index]} label={`${name}, picture ${index + 1} of ${images.length}`} />
      </div>
      <ul role="list" className={styles.thumbs}>
        {images.map((img, i) => (
          <li key={img.seed}>
            <button
              type="button"
              className={styles.thumb}
              aria-pressed={i === index}
              aria-label={`Show picture ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              <GameArt art={img} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
