"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme provider.
 *
 * `attribute="class"` puts `.dark` on <html>, which is what the `dark:`
 * variant in globals.css keys off. next-themes injects a blocking script that
 * applies the stored preference before first paint, so there is no theme
 * flash; the root layout sets `suppressHydrationWarning` on <html> because
 * that script mutates the element before React hydrates.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
