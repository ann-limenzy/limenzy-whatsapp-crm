import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { SIDEBAR_INIT_SCRIPT } from "@/lib/sidebar-preference";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Limenzy CRM",
    template: "%s · Limenzy CRM",
  },
  description:
    "Lightweight CRM for small businesses — leads, customers, follow-ups and renewals.",
};

export const viewport: Viewport = {
  // Keep the browser chrome in step with the active theme's ground colour.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbfe" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1a" },
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
