"use server";

import { cookies } from "next/headers";
import { COOKIES, MOCK_SCENARIOS, THEMES } from "@/lib/prefs";

const YEAR = 60 * 60 * 24 * 365;

const allowed: Record<keyof typeof COOKIES, readonly string[]> = {
  theme: THEMES.map((t) => t.id),
  shell: ["browser", "launcher"],
  display: ["standard", "tv"],
  mock: MOCK_SCENARIOS,
};

export async function setPreference(kind: keyof typeof COOKIES, value: string) {
  if (!allowed[kind]?.includes(value)) throw new Error(`Invalid ${kind}`);
  (await cookies()).set(COOKIES[kind], value, { path: "/", maxAge: YEAR, sameSite: "lax" });
}
