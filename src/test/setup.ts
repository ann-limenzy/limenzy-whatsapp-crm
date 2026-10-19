import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom implements neither matchMedia nor ResizeObserver; next-themes needs the
// former and Radix's popper layer needs the latter.
//
// Guarded because a few suites run in the `node` environment — the database
// schema tests, which talk to Postgres and have no DOM. The shims below are
// unchanged for every jsdom suite; they are simply skipped where there is no
// window to define them on.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  /*
   * Radix's Select drives its popup with pointer capture and scrolls the
   * chosen item into view. jsdom implements neither, and the component
   * throws rather than degrading — so a select that works in a browser
   * cannot be opened in a test without these three.
   *
   * They are no-ops on purpose: the behaviour being tested is which value
   * the control holds, not how the browser scrolled to it.
   */
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

/**
 * Say, once per worker, when the database suites were refused a target.
 *
 * A skipped suite and a passing suite look alike in a summary line, and the
 * difference here is "row-level security was proved" versus "nothing ran".
 * `vitest.config.mts` makes the decision and sets this; repeating it inside
 * the run means the warning is next to the result rather than scrolled off
 * the top of the output.
 */
if (process.env.LIMENZY_DB_TARGET_REFUSED) {
  console.warn(
    `[database suites] NOT RUN — ${process.env.LIMENZY_DB_TARGET_REFUSED} ` +
      "Any database check below is SKIPPED, not passed. " +
      "Run them with: npm run test:db:local",
  );
}
