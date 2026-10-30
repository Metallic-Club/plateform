"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { AvatarFigure, ItemArtView } from "@/components/AvatarFigure";
import { button } from "@/components/ui/button";
import { avatarUpdate } from "@/lib/api/avatar";
import { WARDROBE_CATEGORIES, type AvatarLook, type CatalogItemSummary, type ItemArt, type WardrobeCategory } from "@/lib/api/types";
import { CATEGORY_LABEL } from "@/lib/format";
import styles from "./wardrobe.module.css";

const SKINS = ["#f1cfb0", "#e0b896", "#c99a78", "#a7714c", "#8d5b3e", "#6e4630"];

/*
 * Wardrobe editor. Equipping is instant; Save keeps the outfit for this
 * visit only in the preview.
 * TODO(api): send avatarUpdate(look) to PUT /v1/me/avatar on save.
 */
export function WardrobeEditor({ initial, inventory, name }: {
  initial: AvatarLook;
  inventory: (CatalogItemSummary & { art: ItemArt })[];
  name: string;
}) {
  const [look, setLook] = useState<AvatarLook>(initial);
  const [saved, setSaved] = useState<AvatarLook>(initial);
  const [slot, setSlot] = useState<WardrobeCategory>("shirt");
  const [notice, setNotice] = useState("");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const dirty = JSON.stringify(look) !== JSON.stringify(saved);
  const items = inventory.filter((i) => i.art.category === slot);

  function toggle(item: CatalogItemSummary & { art: ItemArt }) {
    setNotice("");
    setLook((prev) => {
      const equipped = { ...prev.equipped };
      if (equipped[item.art.category]?.itemId === item.id) delete equipped[item.art.category];
      else equipped[item.art.category] = { ...item.art, itemId: item.id };
      return { ...prev, equipped };
    });
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + WARDROBE_CATEGORIES.length) % WARDROBE_CATEGORIES.length;
    setSlot(WARDROBE_CATEGORIES[next]);
    tabs.current[next]?.focus();
  }

  return (
    <div className={`page ${styles.wardrobe}`}>
      <section className={styles.stage} aria-labelledby="wardrobe-title">
        <h1 id="wardrobe-title" className={`wide ${styles.title}`}>
          Wardrobe
        </h1>
        <div className={`milled ${styles.figureWrap}`}>
          <AvatarFigure look={look} className={styles.figure} label={`${name}'s avatar as it looks now`} />
        </div>
        <fieldset className={styles.skins}>
          <legend>Skin tone</legend>
          <div className={styles.skinRow}>
            {SKINS.map((s, i) => (
              <label key={s} className={styles.skin} style={{ background: s }}>
                <input
                  type="radio"
                  name="skin"
                  value={s}
                  checked={look.skin === s}
                  onChange={() => setLook((p) => ({ ...p, skin: s }))}
                />
                <span className="visually-hidden">Tone {i + 1}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles.actions}>
          <button
            type="button"
            className={button("primary")}
            disabled={!dirty}
            onClick={() => {
              setSaved(look);
              void avatarUpdate(look);
              setNotice("Saved for this visit. Saving to your account is not connected in this preview.");
            }}
          >
            Save outfit
          </button>
          <button type="button" className={button("secondary")} disabled={!dirty} onClick={() => setLook(saved)}>
            Undo changes
          </button>
        </div>
        <p className={styles.notice} role="status">
          {notice || (dirty ? "You have unsaved changes." : "")}
        </p>
      </section>

      <section className={styles.closet} aria-label="Your items">
        <div role="tablist" aria-label="Item type" className={styles.tabs}>
          {WARDROBE_CATEGORIES.map((s, i) => (
            <button
              key={s}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${s}`}
              aria-selected={slot === s}
              aria-controls="closet-panel"
              tabIndex={slot === s ? 0 : -1}
              className={styles.tab}
              onClick={() => setSlot(s)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {CATEGORY_LABEL[s]}
            </button>
          ))}
        </div>
        <div id="closet-panel" role="tabpanel" aria-labelledby={`tab-${slot}`} className={styles.panel}>
          {items.length === 0 ? (
            <p className={styles.empty}>
              You do not own any {CATEGORY_LABEL[slot].toLowerCase()} yet.{" "}
              <Link href={`/marketplace?category=${slot}`}>Browse {CATEGORY_LABEL[slot].toLowerCase()} in the Marketplace</Link>
            </p>
          ) : (
            <ul role="list" className={styles.items}>
              {items.map((item) => {
                const on = look.equipped[item.art.category]?.itemId === item.id;
                return (
                  <li key={item.id}>
                    <button type="button" className={styles.item} aria-pressed={on} onClick={() => toggle(item)}>
                      <span className={`milled-sm ${styles.itemArt}`}>
                        <ItemArtView art={item.art} />
                      </span>
                      <span className={styles.itemName}>{item.name}</span>
                      <span className={styles.itemState}>{on ? "Wearing" : "Wear"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href={`/marketplace?category=${slot}`} className={styles.more}>
            Find more {CATEGORY_LABEL[slot].toLowerCase()} in the Marketplace
          </Link>
        </div>
      </section>
    </div>
  );
}
