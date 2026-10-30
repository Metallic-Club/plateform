import { cookies, headers } from "next/headers";
import { chooseShell } from "./launcher-ua";
import { COOKIES, parseDisplay, parseTheme } from "./prefs";

/**
 * Preferences for this request. The shell is `launcher` when the request comes
 * from the desktop Launcher (its user-agent suffix); the `metallic_shell`
 * cookie overrides that for previews. Layout only, never a permission.
 */
export async function getPrefs() {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return {
    theme: parseTheme(jar.get(COOKIES.theme)?.value),
    shell: chooseShell(jar.get(COOKIES.shell)?.value, h.get("user-agent")),
    display: parseDisplay(jar.get(COOKIES.display)?.value),
  };
}

export async function getShell() {
  return (await getPrefs()).shell;
}
