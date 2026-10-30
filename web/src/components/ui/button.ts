import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet";
export type ButtonSize = "small" | "regular" | "large";

/** Class names for anything that should look like a button (a, button, label). */
export function button(variant: ButtonVariant = "secondary", size: ButtonSize = "regular", block = false) {
  return [styles.button, styles[variant], size !== "regular" ? styles[size] : "", block ? styles.block : ""]
    .filter(Boolean)
    .join(" ");
}
