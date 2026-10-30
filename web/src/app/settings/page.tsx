import type { Metadata } from "next";
import { LauncherSettings } from "@/components/launcher/LauncherSettings";
import { ThemePicker } from "@/components/ThemePicker";
import { getApi, getMockScenario } from "@/lib/api";
import { getPrefs } from "@/lib/prefs.server";
import { formatDate } from "@/lib/format";
import { PreferenceRadios } from "./PreferenceRadios";
import { PrivacyForm } from "./PrivacyForm";
import { ProfileForm } from "./ProfileForm";
import styles from "./settings.module.css";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [prefs, scenario] = await Promise.all([getPrefs(), getMockScenario()]);
  let viewer = null;
  try {
    viewer = await (await getApi()).getViewer();
  } catch {
    viewer = null;
  }
  const usingMock = !process.env.METALLIC_API_URL;

  return (
    <div className={`page ${styles.settings}`}>
      <h1 className={`wide ${styles.title}`}>Settings</h1>

      <nav aria-label="Settings sections" className={styles.toc}>
        <a href="#profile">Profile</a>
        {viewer ? <a href="#account">Account and privacy</a> : null}
        <a href="#appearance">Appearance</a>
        <a href="#display">Display</a>
        {prefs.shell === "launcher" ? <a href="#launcher">Metallic Play</a> : null}
        {usingMock ? <a href="#preview">Preview tools</a> : null}
      </nav>

      <section id="profile" className={styles.section} aria-labelledby="profile-title">
        <h2 id="profile-title" className={styles.h2}>
          Profile
        </h2>
        {viewer ? (
          <ProfileForm bio={viewer.user.bio ?? ""} links={viewer.user.socialLinks} />
        ) : (
          <p className={styles.note}>Sign in to edit your bio and linked accounts.</p>
        )}
      </section>

      {viewer ? (
        <section id="account" className={styles.section} aria-labelledby="account-title">
          <h2 id="account-title" className={styles.h2}>
            Account and privacy
          </h2>
          <dl className={styles.facts}>
            <div>
              <dt>Email</dt>
              <dd>{viewer.user.emailMasked}</dd>
            </div>
            <div>
              <dt>Email verified</dt>
              <dd>
                {viewer.user.verification.status === "verified"
                  ? "Yes"
                  : viewer.user.verification.deleteAfter
                    ? `Not yet. Verify by ${formatDate(viewer.user.verification.deleteAfter)} or the account is deleted.`
                    : "Not yet."}
              </dd>
            </div>
          </dl>
          <PrivacyForm initial={viewer.user.settings.privacy} />
        </section>
      ) : null}

      <section id="appearance" className={styles.section} aria-labelledby="appearance-title">
        <h2 id="appearance-title" className="visually-hidden">
          Appearance
        </h2>
        <ThemePicker initial={prefs.theme} />
      </section>

      <section id="display" className={styles.section} aria-labelledby="display-title">
        <h2 id="display-title" className={styles.h2}>
          Display
        </h2>
        <PreferenceRadios
          kind="display"
          legend="Layout"
          current={prefs.display}
          options={[
            { value: "standard", label: "Standard", note: "For a mouse, keyboard or touch screen." },
            {
              value: "tv",
              label: "TV and controller",
              note: "Bigger text and targets, heavier focus outlines, and arrow keys or a d-pad move between items.",
            },
          ]}
        />
      </section>

      {prefs.shell === "launcher" ? (
        <section id="launcher" className={styles.section} aria-labelledby="launcher-title">
          <h2 id="launcher-title" className={styles.h2}>
            Metallic Play
          </h2>
          <LauncherSettings />
        </section>
      ) : null}

      {usingMock ? (
        <section id="preview" className={styles.section} aria-labelledby="preview-title">
          <h2 id="preview-title" className={styles.h2}>
            Preview tools
          </h2>
          <p className={styles.note}>
            For reviewing this build. They change what the sample data returns, so every state of every page can be
            seen without a backend.
          </p>
          <PreferenceRadios
            kind="mock"
            legend="Sample data"
            current={scenario}
            options={[
              { value: "normal", label: "Normal", note: "A signed-in player with friends and history." },
              { value: "empty", label: "Empty", note: "A brand-new account: no friends, history or items." },
              { value: "guest", label: "Signed out", note: "What a visitor sees before signing in." },
              { value: "slow", label: "Slow", note: "Every request takes about two seconds, to show loading states." },
              { value: "error", label: "Failing", note: "Every request fails, to show error states." },
            ]}
          />
          <PreferenceRadios
            kind="shell"
            legend="Host"
            current={prefs.shell}
            options={[
              { value: "browser", label: "Web browser", note: "Play opens the Get Metallic Play flow." },
              {
                value: "launcher",
                label: "Metallic Play",
                note: "The layout the app shows. The app itself is detected from its user agent; this only previews it.",
              },
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}
