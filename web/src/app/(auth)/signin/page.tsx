import type { Metadata } from "next";
import Link from "next/link";
import { getShell } from "@/lib/prefs.server";
import styles from "../auth.module.css";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const shell = await getShell();
  return (
    <div className={`page ${styles.auth}`}>
      <div className={styles.column}>
        <h1 className={`wide ${styles.title}`}>Sign in</h1>
        {shell === "launcher" ? (
          <p className={styles.lede}>
            The app signs you in through your web browser. Finish there, then come back here.
          </p>
        ) : (
          <p className={styles.lede}>Use the email or username you signed up with.</p>
        )}
        <SignInForm launcher={shell === "launcher"} />
        <p>
          New to Metallic?{" "}
          <Link href="/signup" className={styles.textLink}>
            Create an account
          </Link>
        </p>
      </div>

      <aside className={styles.side} aria-labelledby="code-title">
        <h2 id="code-title" className={styles.sideTitle}>
          Signing in on a TV or another device?
        </h2>
        <p className={styles.sideText}>Sign in here on your phone or computer, then pair the other device with a code.</p>
        <ol className={styles.list}>
          <li>On the TV or console, choose Sign in with a code. It shows a short code.</li>
          <li>On this device, open the code page and type it in.</li>
          <li>The other device signs in to your account.</li>
        </ol>
        <Link href="/signin/code" className={styles.textLink}>
          Enter a code from another device
        </Link>
      </aside>
    </div>
  );
}
