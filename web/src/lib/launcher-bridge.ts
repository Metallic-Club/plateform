/**
 * Typed wrapper for the desktop Launcher's bridge, `window.metallic`
 * (plateform #7, section 2; studio plan launcher-l1, Task 4).
 *
 * - Feature-checks `window.metallic` and its `bridgeVersion` before every use.
 * - Only the commands and events listed here can be sent or subscribed to.
 *   Anything else is rejected here with `notAllowed`, before it reaches the
 *   Launcher (which checks again: the Launcher's check is the one that counts).
 * - Without a bridge (a normal browser, or server rendering) `invoke` rejects
 *   with `notAvailable` and `on` returns a no-op, so callers fall back to the
 *   plain website behaviour.
 *
 * The bridge is not a security boundary for the site either: it only changes
 * what the page can ask the Launcher to do.
 *
 * No runtime imports, so the Node test runner can load this file directly.
 */

/** Bridge versions this wrapper understands. */
export const SUPPORTED_BRIDGE_VERSION = 1;

export const BRIDGE_ERROR_CODES = [
  "badRequest",
  "notAllowed",
  "badLink",
  "notInstalled",
  "notAvailable",
  "busy",
  "updateRequired",
  "failed",
] as const;
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export type LauncherInfo = {
  launcherVersion: string;
  bridgeVersion: number;
  platform: string;
  channel: string;
  devMode: boolean;
};

/** Raw product state as the Launcher sends it; see `normalizeProduct` in launcher-status.ts. */
export type RawInstallStatus = { player: unknown; studio: unknown; launcher: unknown };

export type LauncherSettings = { closeToTray: boolean } & Record<string, unknown>;

export type Empty = Record<string, never>;

/** Every command the site may send: name -> [args, result]. */
export interface BridgeCommands {
  getInfo: [undefined, LauncherInfo];
  play: [{ launchUri: string }, Empty];
  installStatus: [undefined, RawInstallStatus];
  installStudio: [undefined, Empty];
  openStudio: [{ place?: string } | undefined, Empty];
  getSettings: [undefined, LauncherSettings];
  setSettings: [{ patch: { closeToTray: boolean } }, LauncherSettings];
  signIn: [undefined, { userCode: string; verificationUri: string }];
  signOut: [undefined, Empty];
}
export type BridgeCommand = keyof BridgeCommands;

export const BRIDGE_COMMANDS: readonly BridgeCommand[] = [
  "getInfo",
  "play",
  "installStatus",
  "installStudio",
  "openStudio",
  "getSettings",
  "setSettings",
  "signIn",
  "signOut",
];

export type SignInState = "pending" | "signedIn" | "denied" | "expired" | "failed";

/** Every event the site may listen to: name -> payload. */
export interface BridgeEvents {
  installProgress: { product: string; percent: number };
  installFinished: { product: string; ok: boolean };
  signIn: { state: SignInState | (string & {}); userCode?: string };
  updateReady: { version: string; required: boolean };
  siteStatus: { up: boolean };
}
export type BridgeEvent = keyof BridgeEvents;

export const BRIDGE_EVENTS: readonly BridgeEvent[] = [
  "installProgress",
  "installFinished",
  "signIn",
  "updateReady",
  "siteStatus",
];

/** The shape `window.metallic` has to have before we touch it. */
export interface MetallicBridge {
  readonly bridgeVersion: number;
  invoke(cmd: string, args?: unknown): Promise<unknown>;
  on(eventName: string, handler: (payload: unknown) => void): unknown;
}

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  constructor(code: BridgeErrorCode) {
    super(`Launcher bridge: ${code}`);
    this.name = "BridgeError";
    this.code = code;
  }
}

export function isBridgeErrorCode(v: unknown): v is BridgeErrorCode {
  return typeof v === "string" && (BRIDGE_ERROR_CODES as readonly string[]).includes(v);
}

export function isAllowedCommand(cmd: unknown): cmd is BridgeCommand {
  return typeof cmd === "string" && (BRIDGE_COMMANDS as readonly string[]).includes(cmd);
}

export function isAllowedEvent(name: unknown): name is BridgeEvent {
  return typeof name === "string" && (BRIDGE_EVENTS as readonly string[]).includes(name);
}

/**
 * `window.metallic` when it looks like a bridge this wrapper can talk to, or
 * null. Safe on the server (no `window`).
 */
export function getBridge(): MetallicBridge | null {
  const w = (globalThis as { window?: { metallic?: unknown } }).window;
  const b = w?.metallic as Partial<MetallicBridge> | undefined;
  if (!b || typeof b !== "object") return null;
  if (typeof b.invoke !== "function" || typeof b.on !== "function") return null;
  const v = b.bridgeVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < SUPPORTED_BRIDGE_VERSION) return null;
  return b as MetallicBridge;
}

export function hasBridge(): boolean {
  return getBridge() !== null;
}

/** Turns whatever the Launcher rejected with into a BridgeError with a known code. */
export function toBridgeError(reason: unknown): BridgeError {
  if (reason instanceof BridgeError) return reason;
  if (isBridgeErrorCode(reason)) return new BridgeError(reason);
  if (reason && typeof reason === "object") {
    const r = reason as { code?: unknown; error?: unknown };
    if (isBridgeErrorCode(r.code)) return new BridgeError(r.code);
    if (isBridgeErrorCode(r.error)) return new BridgeError(r.error);
  }
  return new BridgeError("failed");
}

type ArgsOf<C extends BridgeCommand> = BridgeCommands[C][0];
type ResultOf<C extends BridgeCommand> = BridgeCommands[C][1];
type InvokeArgs<C extends BridgeCommand> = undefined extends ArgsOf<C> ? [args?: ArgsOf<C>] : [args: ArgsOf<C>];

/** Narrows arguments to exactly what the Launcher accepts (it rejects unknown fields). */
function cleanArgs(cmd: BridgeCommand, args: unknown): { ok: true; args: unknown } | { ok: false; code: BridgeErrorCode } {
  const obj = args && typeof args === "object" ? (args as Record<string, unknown>) : undefined;
  switch (cmd) {
    case "play": {
      const uri = obj?.launchUri;
      if (typeof uri !== "string") return { ok: false, code: "badRequest" };
      // The Launcher only plays metallic://play links; refuse others early.
      if (!/^metallic:\/\/play\?/i.test(uri)) return { ok: false, code: "badLink" };
      return { ok: true, args: { launchUri: uri } };
    }
    case "openStudio": {
      const place = obj?.place;
      if (place === undefined) return { ok: true, args: undefined };
      if (typeof place !== "string" || !/^[0-9]{1,20}$/.test(place)) return { ok: false, code: "badRequest" };
      return { ok: true, args: { place } };
    }
    case "setSettings": {
      const patch = obj?.patch as Record<string, unknown> | undefined;
      // The site may change closeToTray and nothing else.
      if (!patch || typeof patch.closeToTray !== "boolean") return { ok: false, code: "badRequest" };
      return { ok: true, args: { patch: { closeToTray: patch.closeToTray } } };
    }
    default:
      // Commands without arguments: send none (the Launcher rejects extra fields).
      return { ok: true, args: undefined };
  }
}

/**
 * Sends one allow-listed command. Resolves to the Launcher's value or rejects
 * with a BridgeError: `notAllowed` for commands outside the allow-list,
 * `notAvailable` when there is no bridge, otherwise the Launcher's own code.
 */
export async function invoke<C extends BridgeCommand>(cmd: C, ...rest: InvokeArgs<C>): Promise<ResultOf<C>> {
  if (!isAllowedCommand(cmd)) throw new BridgeError("notAllowed");
  const bridge = getBridge();
  if (!bridge) throw new BridgeError("notAvailable");
  const cleaned = cleanArgs(cmd, rest[0]);
  if (!cleaned.ok) throw new BridgeError(cleaned.code);
  try {
    const result =
      cleaned.args === undefined ? await bridge.invoke(cmd) : await bridge.invoke(cmd, cleaned.args);
    return result as ResultOf<C>;
  } catch (e) {
    throw toBridgeError(e);
  }
}

/**
 * Listens to one allow-listed Launcher event. Returns a function that stops
 * listening. Without a bridge, or for an unknown event, it does nothing.
 */
export function on<E extends BridgeEvent>(eventName: E, handler: (payload: BridgeEvents[E]) => void): () => void {
  if (!isAllowedEvent(eventName)) return () => {};
  const bridge = getBridge();
  if (!bridge) return () => {};
  let active = true;
  const forward = (payload: unknown) => {
    if (active && payload && typeof payload === "object") handler(payload as BridgeEvents[E]);
  };
  let off: unknown;
  try {
    off = bridge.on(eventName, forward);
  } catch {
    return () => {};
  }
  return () => {
    active = false;
    if (typeof off === "function") {
      try {
        off();
      } catch {
        // The Launcher may not support unsubscribing; `active` already stops delivery.
      }
    }
  };
}

/** Plain words for a bridge error, for status lines. */
export function describeBridgeError(code: BridgeErrorCode): string {
  switch (code) {
    case "notAvailable":
      return "This needs the Metallic app.";
    case "notInstalled":
      return "That is not installed yet.";
    case "busy":
      return "The app is busy with another task. Try again in a moment.";
    case "updateRequired":
      return "The app needs an update first. Restart Metallic to update.";
    case "badLink":
      return "That link cannot be opened.";
    case "notAllowed":
      return "The app does not allow that from this page.";
    case "badRequest":
    case "failed":
    default:
      return "Something went wrong in the app. Try again.";
  }
}
