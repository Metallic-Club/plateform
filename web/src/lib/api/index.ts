import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/launcher-handoff";
import { COOKIES, MOCK_SCENARIOS, type MockScenario } from "@/lib/prefs";
import type { MetallicApi } from "./client";
import { createHttpApi } from "./http";
import { createMockApi } from "./mock";

export type { MetallicApi } from "./client";
export { ApiError } from "./client";
export * from "./types";

export async function getMockScenario(): Promise<MockScenario> {
  const value = (await cookies()).get(COOKIES.mock)?.value;
  return MOCK_SCENARIOS.includes(value as MockScenario) ? (value as MockScenario) : "normal";
}

/** The API for the current request. Server code only. */
export async function getApi(): Promise<MetallicApi> {
  const base = process.env.METALLIC_API_URL;
  if (base) {
    const session = (await cookies()).get(SESSION_COOKIE)?.value;
    return createHttpApi(base, session ? `${SESSION_COOKIE}=${session}` : undefined);
  }
  return createMockApi(await getMockScenario());
}
