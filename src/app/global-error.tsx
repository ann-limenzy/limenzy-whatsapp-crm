"use client";

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * It replaces the whole document, so it must render its own <html>/<body> and
 * cannot rely on the theme provider or application styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fafbfe",
          color: "#111a2e",
        }}
      >
        <main
          style={{ maxWidth: "32rem", padding: "2rem", textAlign: "center" }}
        >
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0 0 1.5rem",
              color: "#4a5568",
              fontSize: "0.875rem",
            }}
          >
            The application failed to start.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid #c9d2e3",
              background: "#fff",
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
