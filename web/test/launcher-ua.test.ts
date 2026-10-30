// Launcher detection from the user agent (plateform #7, section 1).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseShell, isLauncherUserAgent, parseLauncherUserAgent } from "../src/lib/launcher-ua.ts";

const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

describe("parseLauncherUserAgent", () => {
  it("reads the Launcher suffix the plan specifies", () => {
    assert.deepEqual(parseLauncherUserAgent(`${EDGE} MetallicLauncher/0.1.0 bridge/1`), { version: "0.1.0", bridge: 1 });
  });

  it("accepts pre-release versions and later bridge versions", () => {
    assert.deepEqual(parseLauncherUserAgent(`${EDGE} MetallicLauncher/1.2.0-beta.3 bridge/2`), {
      version: "1.2.0-beta.3",
      bridge: 2,
    });
  });

  it("finds the token even when something follows it", () => {
    assert.ok(isLauncherUserAgent(`${EDGE} MetallicLauncher/0.1.0 bridge/1 SomethingElse/3`));
  });

  it("rejects ordinary browsers and empty values", () => {
    for (const ua of [EDGE, "", null, undefined, "curl/8.0"]) assert.equal(parseLauncherUserAgent(ua), null, String(ua));
  });

  it("rejects near misses", () => {
    for (const ua of [
      `${EDGE} MetallicLauncher/0.1.0`, // no bridge part
      `${EDGE} MetallicLauncher/0.1.0 bridge/`, // no bridge number
      `${EDGE} MetallicLauncher/0.1.0 bridge/0`, // bridge versions start at 1
      `${EDGE} MetallicLauncher/0.1.0 bridge/1x`, // trailing junk
      `${EDGE} XMetallicLauncher/0.1.0 bridge/1`, // not its own token
      `${EDGE} metalliclauncher/0.1.0 bridge/1`, // wrong case
      `${EDGE} MetallicLauncher/ bridge/1`, // no version
    ]) {
      assert.equal(parseLauncherUserAgent(ua), null, ua);
    }
  });

  it("ignores absurdly long user agents", () => {
    assert.equal(parseLauncherUserAgent(`${"a".repeat(3000)} MetallicLauncher/0.1.0 bridge/1`), null);
  });
});

describe("chooseShell", () => {
  const launcherUa = `${EDGE} MetallicLauncher/0.1.0 bridge/1`;

  it("uses the user agent when there is no preview cookie", () => {
    assert.equal(chooseShell(undefined, launcherUa), "launcher");
    assert.equal(chooseShell(undefined, EDGE), "browser");
  });

  it("lets the shell cookie override either way, for previews", () => {
    assert.equal(chooseShell("launcher", EDGE), "launcher");
    assert.equal(chooseShell("browser", launcherUa), "browser");
  });

  it("ignores cookie values it does not know", () => {
    assert.equal(chooseShell("admin", launcherUa), "launcher");
    assert.equal(chooseShell("", EDGE), "browser");
  });
});
