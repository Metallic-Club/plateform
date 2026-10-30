// The bridge wrapper's allow-list, argument narrowing, error mapping and fallbacks.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  BRIDGE_COMMANDS,
  BridgeError,
  getBridge,
  invoke,
  isAllowedCommand,
  on,
  toBridgeError,
} from "../src/lib/launcher-bridge.ts";
import { normalizeInstallStatus } from "../src/lib/launcher-status.ts";

type Call = { cmd: string; args: unknown[] };

/** A stand-in for window.metallic that records calls. */
function fakeBridge(reply: (cmd: string, args: unknown) => Promise<unknown> = async () => ({})) {
  const calls: Call[] = [];
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  const bridge = {
    bridgeVersion: 1,
    invoke(...args: unknown[]) {
      calls.push({ cmd: args[0] as string, args: args.slice(1) });
      return reply(args[0] as string, args[1]);
    },
    on(name: string, h: (p: unknown) => void) {
      handlers.set(name, [...(handlers.get(name) ?? []), h]);
    },
  };
  const emit = (name: string, payload: unknown) => handlers.get(name)?.forEach((h) => h(payload));
  return { bridge, calls, handlers, emit };
}

function install(bridge: unknown) {
  (globalThis as { window?: unknown }).window = { metallic: bridge };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

async function rejectsWith(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: unknown) => e instanceof BridgeError && e.code === code);
}

describe("allow-list", () => {
  it("holds exactly the commands in plateform #7 section 2, plus restartToUpdate", () => {
    assert.deepEqual([...BRIDGE_COMMANDS].sort(), [
      "getInfo",
      "getSettings",
      "installStatus",
      "installStudio",
      "openStudio",
      "play",
      "restartToUpdate",
      "setSettings",
      "signIn",
      "signOut",
    ]);
  });

  it("rejects other commands before they reach the Launcher", async () => {
    const f = fakeBridge();
    install(f.bridge);
    for (const cmd of ["githubSignIn", "retrySite", "runShell", "openExternal", "__proto__", "constructor", "", "GETINFO"]) {
      assert.equal(isAllowedCommand(cmd), false, cmd);
      // Callers without types (plain JS, devtools) can still pass anything.
      await rejectsWith((invoke as unknown as (c: string) => Promise<unknown>)(cmd), "notAllowed");
    }
    assert.equal(f.calls.length, 0);
  });

  it("sends allowed commands without arguments when they take none", async () => {
    const f = fakeBridge(async () => ({ launcherVersion: "0.1.0", bridgeVersion: 1, platform: "windows", channel: "dev", devMode: true }));
    install(f.bridge);
    const info = await invoke("getInfo");
    assert.equal(info.launcherVersion, "0.1.0");
    assert.deepEqual(f.calls, [{ cmd: "getInfo", args: [] }]);
  });
});

describe("arguments", () => {
  it("play passes only launchUri, and only metallic://play links", async () => {
    const f = fakeBridge();
    install(f.bridge);
    await invoke("play", { launchUri: "metallic://play?place=1&ticket=jt_abcdefgh", extra: 1 } as never);
    assert.deepEqual(f.calls[0], { cmd: "play", args: [{ launchUri: "metallic://play?place=1&ticket=jt_abcdefgh" }] });
    await rejectsWith(invoke("play", { launchUri: "https://evil.test" }), "badLink");
    await rejectsWith(invoke("play", { launchUri: "metallic://install" }), "badLink");
    await rejectsWith(invoke("play", {} as never), "badRequest");
    assert.equal(f.calls.length, 1);
  });

  it("setSettings may only change closeToTray", async () => {
    const f = fakeBridge(async () => ({ closeToTray: true }));
    install(f.bridge);
    await invoke("setSettings", { patch: { closeToTray: true, developerMode: true, devUrl: "http://evil.test" } } as never);
    assert.deepEqual(f.calls[0].args, [{ patch: { closeToTray: true } }]);
    await rejectsWith(invoke("setSettings", { patch: { developerMode: true } } as never), "badRequest");
    assert.equal(f.calls.length, 1);
  });

  it("openStudio takes an optional numeric place id", async () => {
    const f = fakeBridge();
    install(f.bridge);
    await invoke("openStudio");
    await invoke("openStudio", { place: "1050000000000001" });
    assert.deepEqual(f.calls, [
      { cmd: "openStudio", args: [] },
      { cmd: "openStudio", args: [{ place: "1050000000000001" }] },
    ]);
    await rejectsWith(invoke("openStudio", { place: "../x" }), "badRequest");
  });
});

describe("errors", () => {
  it("passes the Launcher's error codes through", async () => {
    for (const code of ["notInstalled", "busy", "updateRequired", "badLink"]) {
      install(fakeBridge(async () => Promise.reject({ error: code })).bridge);
      await rejectsWith(invoke("installStudio"), code);
    }
  });

  it("maps anything unknown to failed and never leaks internal text", () => {
    assert.equal(toBridgeError(new Error("C:\\secret\\path")).code, "failed");
    assert.equal(toBridgeError("kaboom").code, "failed");
    assert.equal(toBridgeError({ code: "notAvailable" }).code, "notAvailable");
    assert.equal(toBridgeError("busy").code, "busy");
  });
});

describe("no bridge", () => {
  it("invoke rejects with notAvailable and on is a no-op", async () => {
    assert.equal(getBridge(), null);
    await rejectsWith(invoke("getInfo"), "notAvailable");
    const off = on("signIn", () => assert.fail("no events without a bridge"));
    off();
  });

  it("ignores objects that only look like a bridge", () => {
    for (const fake of [
      {},
      { bridgeVersion: 1 },
      { bridgeVersion: 1, invoke: () => {} }, // no on
      { bridgeVersion: "1", invoke: () => {}, on: () => {} },
      { bridgeVersion: 0, invoke: () => {}, on: () => {} },
      { bridgeVersion: 1.5, invoke: () => {}, on: () => {} },
      "metallic",
    ]) {
      install(fake);
      assert.equal(getBridge(), null, JSON.stringify(fake));
    }
  });
});

describe("events", () => {
  it("only subscribes to known events and stops delivering after off()", () => {
    const f = fakeBridge();
    install(f.bridge);
    const seen: unknown[] = [];
    const off = on("updateReady", (e) => seen.push(e));
    on("devtoolsOpened" as never, () => assert.fail("unknown events are not subscribed"));
    assert.deepEqual([...f.handlers.keys()], ["updateReady"]);
    f.emit("updateReady", { version: "0.2.0", required: false });
    off();
    f.emit("updateReady", { version: "0.3.0", required: true });
    assert.deepEqual(seen, [{ version: "0.2.0", required: false }]);
  });
});

describe("installStatus", () => {
  it("reads serde's externally tagged enums", () => {
    const s = normalizeInstallStatus({
      player: { installed: { version: "0.3.1" } },
      studio: "notInstalled",
      launcher: { readyToRestart: { version: "0.2.0", required: true } },
    });
    assert.deepEqual(s.player, { state: "installed", version: "0.3.1" });
    assert.deepEqual(s.studio, { state: "notInstalled" });
    assert.deepEqual(s.launcher, { state: "readyToRestart", version: "0.2.0", required: true });
  });

  it("reads a flat tagged form and clamps percentages", () => {
    const s = normalizeInstallStatus({
      player: { state: "installing", percent: 140 },
      studio: { installing: { percent: 41.6 } },
      launcher: "upToDate",
    });
    assert.deepEqual(s.player, { state: "installing", percent: 100 });
    assert.deepEqual(s.studio, { state: "installing", percent: 42 });
    assert.deepEqual(s.launcher, { state: "upToDate" });
  });

  it("treats anything else as unknown", () => {
    const s = normalizeInstallStatus(null);
    assert.deepEqual(s, { player: { state: "unknown" }, studio: { state: "unknown" }, launcher: { state: "unknown" } });
  });
});
