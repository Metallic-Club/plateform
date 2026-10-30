/** Sets a data-* attribute on <html> so a preference applies before the server round trip. */
export function setRootData(key: "theme" | "display", value: string) {
  document.documentElement.dataset[key] = value;
}
