import type { Metadata } from "next";
import Link from "next/link";
import styles from "../auth.module.css";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <div className={`page ${styles.auth}`}>
      <div className={styles.column}>
        <h1 className={`wide ${styles.title}`}>Create an account</h1>
        <p className={styles.lede}>One account for playing, the Wardrobe and Metallic Studio.</p>
        <SignUpForm />
        <p>
          Already have an account?{" "}
          <Link href="/signin" className={styles.textLink}>
            Sign in
          </Link>
        </p>
      </div>

      <aside className={styles.side} aria-labelledby="rules-title">
        <h2 id="rules-title" className={styles.sideTitle}>
          Before you sign up
        </h2>
        <ul className={styles.list}>
          <li>
            Verify your email within 30 days of signing up. Accounts that are never verified are removed after that.
          </li>
          <li>Your username is how friends find you. Pick one you are happy to keep.</li>
          <li>A ban on one account applies to every other account owned by the same person.</li>
        </ul>
        <p className={styles.hint}>These rules are drafts and may change before accounts open.</p>
      </aside>
    </div>
  );
}
