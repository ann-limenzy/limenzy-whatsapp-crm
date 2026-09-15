"use client";

import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Deep-linkable theme, for the wireframe routes only.
 *
 * `/wireframes/...?theme=dark` opens directly in that theme. Two reasons it
 * exists: a presenter can send the client a link that opens the way they
 * intend, and screenshot capture becomes deterministic instead of depending
 * on whatever the machine's OS preference happens to be.
 *
 * It only ever forwards to the existing next-themes provider, so there is no
 * second theme mechanism to keep in step.
 */
export function ThemeFromQuery() {
  const params = useSearchParams();
  const { setTheme } = useTheme();
  const requested = params.get("theme");

  useEffect(() => {
    if (
      requested === "dark" ||
      requested === "light" ||
      requested === "system"
    ) {
      setTheme(requested);
    }
  }, [requested, setTheme]);

  return null;
}
