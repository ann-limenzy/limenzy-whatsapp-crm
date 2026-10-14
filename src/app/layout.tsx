import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { GROUND_DARK, GROUND_LIGHT } from "@/lib/brand-colors";
import { SIDEBAR_INIT_SCRIPT } from "@/lib/sidebar-preference";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Limenzy CRM",
    template: "%s · Limenzy CRM",
  },
  description:
    "Lightweight CRM for small businesses — leads, customers, follow-ups and renewals.",
  applicationName: "Limenzy",
  /**
   * Apple web-app metadata (Milestone 1E). iOS reads these rather than the web
   * app manifest when deciding how a home-screen launch behaves: `capable`
   * removes the browser chrome, `title` names the home-screen icon, and
   * `statusBarStyle: "default"` keeps the status bar legible against the light
   * ground rather than drawing it translucent over the content.
   */
  appleWebApp: {
    capable: true,
    title: "Limenzy",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  /** Stop iOS turning numbers into tappable phone links inside CRM content. */
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  /**
   * `cover` is what makes `env(safe-area-inset-*)` resolve to real values on
   * iOS. The shell already pads for those insets in three places — the mobile
   * bar, the drawer footer and the main column — and without this they all
   * resolved to 0, so the bottom bar sat under the home indicator. This fixes
   * that, which is why it belongs in the PWA foundation rather than later.
   */
  viewportFit: "cover",
  // Keep the browser chrome in step with the active theme's ground colour.
  // Derived from --background in globals.css; see @/lib/brand-colors.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: GROUND_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: GROUND_DARK },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes applies the stored theme to <html>
    // in a blocking script before React hydrates, so the server and client
    // markup differ on this element by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Applies the stored sidebar preference to <html> before first paint,
          the same technique next-themes uses for the colour theme. Without it
          the rail would paint expanded and then snap closed after hydration.
          It only ever sets an attribute, so it cannot affect authorization.
        */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegistration />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
