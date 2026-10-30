import type { Metadata } from "next";
import Link from "next/link";
import styles from "../../auth.module.css";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = { title: "Enter a code" };

export default function CodePage() {
  return (
    <div className={`page ${styles.auth}`}>
      <div className={styles.column}>
        <h1 className={`wide ${styles.title}`}>Enter the code</h1>
        <p className={styles.lede}>Type the code your TV, console or other device is showing.</p>
        <CodeForm />
        <Link href="/signin" className={styles.textLink}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
