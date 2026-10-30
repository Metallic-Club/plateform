"use client";

import { useEffect } from "react";

/*
 * 10-foot layout stub: arrow keys (and a controller's d-pad, which most TV
 * browsers and web views map to arrow keys) move focus to the nearest control
 * in that direction. Enter activates; Escape or Backspace goes back.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]';

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function next(from: HTMLElement, dir: Dir) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of document.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el === from || !visible(el)) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const ok =
      (dir === "ArrowRight" && dx > 4) ||
      (dir === "ArrowLeft" && dx < -4) ||
      (dir === "ArrowDown" && dy > 4) ||
      (dir === "ArrowUp" && dy < -4);
    if (!ok) continue;
    const along = dir === "ArrowLeft" || dir === "ArrowRight" ? Math.abs(dx) : Math.abs(dy);
    const across = dir === "ArrowLeft" || dir === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export function TvNavigation() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.key === "Escape" || (e.key === "Backspace" && !["INPUT", "TEXTAREA"].includes(t.tagName))) {
        if (!document.querySelector("dialog[open]")) history.back();
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const from = (document.activeElement as HTMLElement) ?? document.body;
      const target = from === document.body ? document.querySelector<HTMLElement>(`main ${FOCUSABLE}`) : next(from, e.key as Dir);
      if (target) {
        e.preventDefault();
        target.focus();
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
