import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { HandoffNotice } from "@/components/shell/HandoffNotice";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { TabBar } from "@/components/shell/NavLinks";
import { TvNavigation } from "@/components/shell/TvNavigation";
import { getApi } from "@/lib/api";
import type { Viewer } from "@/lib/api/types";
import { getPrefs } from "@/lib/prefs.server";
// The shared tokens first (once, here), then the site's themes and base styles.
import "@/styles/metallic-tokens.css";
import "./globals.css";

/*
 * Archivo: an industrial grotesque with a width axis. Stretched to 125% it
 * reads like stamped serial plates (game names, the wordmark); at 100% it is
 * a compact, legible UI face. One family does both jobs.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

/* JetBrains Mono, the token mono face: versions and codes people read back. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Metallic", template: "%s | Metallic" },
  description: "Play games made by the Metallic community, dress your avatar and find friends.",
  applicationName: "Metallic",
};

export const viewport: Viewport = {
  themeColor: [
    // bg.base of Graphite and Light (metallic-tokens.css, globals.css).
    { media: "(prefers-color-scheme: dark)", color: "#16151b" },
    { media: "(prefers-color-scheme: light)", color: "#eceaf0" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const prefs = await getPrefs();
  let viewer: Viewer | null = null;
  try {
    viewer = await (await getApi()).getViewer();
  } catch {
    // The page itself reports API failures; the shell stays usable.
    viewer = null;
  }

  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrainsMono.variable}`}
      data-theme={prefs.theme}
      data-display={prefs.display}
      data-shell={prefs.shell}
    >
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Suspense fallback={<div style={{ height: "var(--header-h)" }} />}>
          <SiteHeader viewer={viewer} shell={prefs.shell} theme={prefs.theme} />
        </Suspense>
        <main id="main" tabIndex={-1}>
          {viewer ? (
            <Suspense fallback={null}>
              <HandoffNotice displayName={viewer.user.displayName} username={viewer.user.username} />
            </Suspense>
          ) : null}
          {children}
        </main>
        <SiteFooter shell={prefs.shell} />
        <TabBar />
        {prefs.display === "tv" ? <TvNavigation /> : null}
      </body>
    </html>
  );
}
