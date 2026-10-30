import { cookies } from "next/headers";
import { COOKIES, parseDisplay, parseShell, parseTheme } from "./prefs";

export async function getPrefs() {
  const jar = await cookies();
  return {
    theme: parseTheme(jar.get(COOKIES.theme)?.value),
    shell: parseShell(jar.get(COOKIES.shell)?.value),
    display: parseDisplay(jar.get(COOKIES.display)?.value),
  };
}

export async function getShell() {
  return (await getPrefs()).shell;
}
