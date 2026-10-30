"use client";

import { useEffect, useState } from "react";
import { button } from "@/components/ui/button";
import { useHasBridge } from "@/components/launcher/hooks";
import { BridgeError, describeBridgeError, invoke, on } from "@/lib/launcher-bridge";
import styles from "../auth.module.css";

type Phase =
  | { kind: "ready" }
  | { kind: "starting" }
  | { kind: "code"; userCode: string; verificationUri: string | null }
  | { kind: "signedIn" }
  | { kind: "stopped"; text: string };

/** Only https links leave the app; anything else is not shown as a link. */
function httpsOnly(uri: unknown): string | null {
  if (typeof uri !== "string") return null;
  try {
    return new URL(uri).protocol === "https:" ? uri : null;
  } catch {
    return null;
  }
}

/**
 * Sign-in inside the Launcher (plateform #7, section 3). No password field:
 * the Launcher runs the device flow, opens the browser and reports back with
 * `signIn` events. Once signed in, the Launcher opens /auth/launcher-handoff,
 * which gives this web view its session.
 */
export function LauncherSignIn() {
  const hasBridge = useHasBridge();
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });

  useEffect(() => {
    if (!hasBridge) return;
    return on("signIn", (e) => {
      switch (e.state) {
        case "signedIn":
          setPhase({ kind: "signedIn" });
          break;
        case "denied":
          setPhase({ kind: "stopped", text: "Sign-in was cancelled in the browser. Start again when you are ready." });
          break;
        case "expired":
          setPhase({ kind: "stopped", text: "The code expired before it was approved. Get a new code to try again." });
          break;
        case "failed":
          setPhase({ kind: "stopped", text: "Sign-in did not finish. Try again." });
          break;
        default:
          // "pending", or a newer state: keep showing the code.
          if (typeof e.userCode === "string") {
            const userCode = e.userCode;
            setPhase((p) => (p.kind === "code" ? { ...p, userCode } : p));
          }
      }
    });
  }, [hasBridge]);

  async function start() {
    setPhase({ kind: "starting" });
    try {
      const r = await invoke("signIn");
      setPhase({ kind: "code", userCode: r.userCode, verificationUri: httpsOnly(r.verificationUri) });
    } catch (e) {
      setPhase({ kind: "stopped", text: describeBridgeError(e instanceof BridgeError ? e.code : "failed") });
    }
  }

  if (!hasBridge) {
    return (
      <div className={styles.form}>
        <p className={styles.banner} data-tone="warning">
          This page is showing the app layout, but the Metallic app is not connected, so it cannot sign you in here.
        </p>
        <a href="/signin?shell=browser" className={styles.textLink}>
          Use the browser sign-in instead
        </a>
      </div>
    );
  }

  if (phase.kind === "code") {
    return (
      <div className={styles.form}>
        <div className={styles.device}>
          <p className={styles.deviceLabel} id="device-code-label">
            Your code
          </p>
          <p className={styles.deviceCode} aria-labelledby="device-code-label">
            {phase.userCode}
          </p>
          <ol className={styles.deviceSteps}>
            <li>Your browser opened the Metallic sign-in page.</li>
            <li>Sign in there and check that it shows this code.</li>
            <li>Approve, then come back here. This window signs in by itself.</li>
          </ol>
          <p className={styles.waiting} role="status" aria-live="polite">
            <span className={styles.waitingDot} aria-hidden="true" />
            Waiting for you to approve in the browser
          </p>
        </div>
        {phase.verificationUri ? (
          <p className={styles.hint}>
            Browser did not open?{" "}
            <a href={phase.verificationUri} className={styles.textLink}>
              Open the sign-in page
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  if (phase.kind === "signedIn") {
    return (
      <p className={styles.banner} data-tone="success" role="status">
        Signed in. Opening your account.
      </p>
    );
  }

  return (
    <div className={styles.form}>
      {phase.kind === "stopped" ? (
        <p className={styles.banner} data-tone="error" role="alert">
          {phase.text}
        </p>
      ) : null}
      <div className={styles.row}>
        <button type="button" className={button("primary", "large")} onClick={start} disabled={phase.kind === "starting"}>
          {phase.kind === "stopped" ? "Get a new code" : "Sign in with your browser"}
        </button>
      </div>
      <p className={styles.hint}>
        Your browser opens the Metallic sign-in page. You never type your password into this window.
      </p>
    </div>
  );
}
