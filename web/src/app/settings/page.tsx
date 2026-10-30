import type { Metadata } from "next";
import { ThemePicker } from "@/components/ThemePicker";
import { getApi, getMockScenario } from "@/lib/api";
import { getPrefs } from "@/lib/prefs.server";
import { PreferenceRadios } from "./PreferenceRadios";
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
        <a href="#appearance">Appearance</a>
        <a href="#display">Display</a>
        {usingMock ? <a href="#preview">Preview tools</a> : null}
      </nav>

      <section id="profile" className={styles.section} aria-labelledby="profile-title">
        <h2 id="profile-title" className={styles.h2}>
          Profile
        </h2>
        {viewer ? (
          <ProfileForm bio={viewer.user.bio} links={viewer.user.links} />
        ) : (
          <p className={styles.note}>Sign in to edit your bio and linked accounts.</p>
        )}
      </section>

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
              { value: "browser", label: "Web browser", note: "Play opens the Get Metallic flow." },
              { value: "launcher", label: "Metallic app", note: "Play opens games directly, as inside the launcher." },
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}
