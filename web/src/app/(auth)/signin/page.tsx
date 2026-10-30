import type { Metadata } from "next";
import Link from "next/link";
import { getShell } from "@/lib/prefs.server";
import styles from "../auth.module.css";
import { LauncherSignIn } from "./LauncherSignIn";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

const HANDOFF_NOTICE: Record<string, { tone: "warning" | "error"; text: string }> = {
  expired: { tone: "warning", text: "That sign-in link expired or was already used. Sign in again to continue." },
  failed: { tone: "error", text: "Signing you in did not work on our side. Try again in a moment." },
};

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const [shell, params] = await Promise.all([getShell(), searchParams]);
  const launcher = shell === "launcher";
  const handoff = typeof params.handoff === "string" ? HANDOFF_NOTICE[params.handoff] : undefined;
  const signedOut = params.signedout === "1";

  return (
    <div className={`page ${styles.auth}`}>
      <div className={styles.column}>
        <h1 className={`wide ${styles.title}`}>Sign in</h1>
        {handoff ? (
          <p className={styles.banner} data-tone={handoff.tone} role="alert">
            {handoff.text}
          </p>
        ) : signedOut ? (
          <p className={styles.banner} role="status">
            You are signed out.
          </p>
        ) : null}
        {launcher ? (
          <p className={styles.lede}>
            Metallic signs you in through your web browser, so your password stays there. It takes a code and one
            click.
          </p>
        ) : (
          <p className={styles.lede}>Use the email or username you signed up with.</p>
        )}
        {launcher ? <LauncherSignIn /> : <SignInForm />}
        <p>
          New to Metallic?{" "}
          <Link href="/signup" className={styles.textLink}>
            Create an account
          </Link>
        </p>
      </div>

      {launcher ? null : (
        <aside className={styles.side} aria-labelledby="code-title">
          <h2 id="code-title" className={styles.sideTitle}>
            Signing in on a TV or another device?
          </h2>
          <p className={styles.sideText}>
            Sign in here on your phone or computer, then pair the other device with a code.
          </p>
          <ol className={styles.list}>
            <li>On the TV or console, choose Sign in with a code. It shows a short code.</li>
            <li>On this device, open the code page and type it in.</li>
            <li>The other device signs in to your account.</li>
          </ol>
          <Link href="/signin/code" className={styles.textLink}>
            Enter a code from another device
          </Link>
        </aside>
      )}
    </div>
  );
}
