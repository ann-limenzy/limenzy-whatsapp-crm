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
}
