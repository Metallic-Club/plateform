/**
 * Reads the Launcher's `installStatus` reply into one shape the UI can use.
 *
 * The Launcher serialises Rust enums with serde, so a product can arrive as a
 * bare string ("notInstalled") or as a one-key object
 * ({"installed": {"version": "0.3.1"}}). A flat {"state": "installed", ...}
 * form is accepted too, in case the Launcher switches to tagged enums.
 *
 * No imports, so the Node test runner can load this file directly.
 */

export type ProductState =
  | { state: "installed"; version?: string }
  | { state: "notInstalled" }
  | { state: "installing"; percent?: number }
  | { state: "failed" }
  | { state: "unknown" };

export type LauncherState =
  | { state: "upToDate" }
  | { state: "checking" }
  | { state: "downloading"; percent?: number }
  | { state: "readyToRestart"; version?: string; required: boolean }
  | { state: "failed" }
  | { state: "unknown" };

export type InstallStatus = { player: ProductState; studio: ProductState; launcher: LauncherState };

function unpack(raw: unknown): { tag: string; body: Record<string, unknown> } | null {
  if (typeof raw === "string") return { tag: raw, body: {} };
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.state === "string") return { tag: o.state, body: o };
  const keys = Object.keys(o);
  if (keys.length !== 1) return null;
  const inner = o[keys[0]];
  return { tag: keys[0], body: inner && typeof inner === "object" ? (inner as Record<string, unknown>) : {} };
}

function percent(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : undefined;
}

function version(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 && v.length <= 64 ? v : undefined;
}

export function normalizeProduct(raw: unknown): ProductState {
  const u = unpack(raw);
  switch (u?.tag) {
    case "installed":
      return { state: "installed", version: version(u.body.version) };
    case "notInstalled":
      return { state: "notInstalled" };
    case "installing":
      return { state: "installing", percent: percent(u.body.percent) };
    case "failed":
      return { state: "failed" };
    default:
      return { state: "unknown" };
  }
}

export function normalizeLauncher(raw: unknown): LauncherState {
  const u = unpack(raw);
  switch (u?.tag) {
    case "upToDate":
      return { state: "upToDate" };
    case "checking":
      return { state: "checking" };
    case "downloading":
      return { state: "downloading", percent: percent(u.body.percent) };
    case "readyToRestart":
      return { state: "readyToRestart", version: version(u.body.version), required: u.body.required === true };
    case "failed":
      return { state: "failed" };
    default:
      return { state: "unknown" };
  }
}

export function normalizeInstallStatus(raw: unknown): InstallStatus {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    player: normalizeProduct(o.player),
    studio: normalizeProduct(o.studio),
    launcher: normalizeLauncher(o.launcher),
  };
}
