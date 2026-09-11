import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SIDEBAR_STATE,
  SIDEBAR_ATTRIBUTE,
  SIDEBAR_STORAGE_KEY,
  applySidebarState,
  parseSidebarState,
  readAppliedSidebarState,
  readStoredSidebarState,
  setSidebarState,
  toggleSidebarState,
  writeStoredSidebarState,
} from "@/lib/sidebar-preference";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(SIDEBAR_ATTRIBUTE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sidebar preference storage", () => {
  it("uses a versioned, application-specific key", () => {
    expect(SIDEBAR_STORAGE_KEY).toBe("limenzy-crm:sidebar-state:v1");
  });

  it("defaults to expanded when nothing is stored", () => {
    expect(DEFAULT_SIDEBAR_STATE).toBe("expanded");
    expect(readStoredSidebarState()).toBe("expanded");
  });

  it("round-trips both valid values", () => {
    writeStoredSidebarState("collapsed");
    expect(readStoredSidebarState()).toBe("collapsed");

    writeStoredSidebarState("expanded");
    expect(readStoredSidebarState()).toBe("expanded");
  });

  it("falls back to expanded for any invalid stored value", () => {
    for (const bad of ["", "COLLAPSED", "open", "null", "0", "{}", "true"]) {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, bad);
      expect(readStoredSidebarState(), `stored ${JSON.stringify(bad)}`).toBe(
        "expanded",
      );
    }
  });

  it("parses unknown values safely", () => {
    expect(parseSidebarState("collapsed")).toBe("collapsed");
    expect(parseSidebarState("expanded")).toBe("expanded");
    for (const bad of [null, undefined, 42, {}, [], "nope"]) {
      expect(parseSidebarState(bad)).toBe("expanded");
    }
  });

  it("falls back to expanded when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(readStoredSidebarState()).toBe("expanded");
  });

  it("does not throw when writing to unavailable storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeStoredSidebarState("collapsed")).not.toThrow();
  });
});

describe("document application", () => {
  it("reads expanded when no attribute is present", () => {
    expect(readAppliedSidebarState()).toBe("expanded");
  });

  it("applies and reads back the state", () => {
    applySidebarState("collapsed");
    expect(document.documentElement.getAttribute(SIDEBAR_ATTRIBUTE)).toBe(
      "collapsed",
    );
    expect(readAppliedSidebarState()).toBe("collapsed");
  });

  it("treats an unrecognised attribute value as expanded", () => {
    document.documentElement.setAttribute(SIDEBAR_ATTRIBUTE, "sideways");
    expect(readAppliedSidebarState()).toBe("expanded");
  });

  it("setSidebarState applies AND persists in one step", () => {
    setSidebarState("collapsed");
    expect(readAppliedSidebarState()).toBe("collapsed");
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("collapsed");
  });
});

describe("toggleSidebarState", () => {
  it("flips between the two states", () => {
    expect(toggleSidebarState("expanded")).toBe("collapsed");
    expect(toggleSidebarState("collapsed")).toBe("expanded");
  });
});

/**
 * These tests execute the shipped init script string so the thing that
 * actually runs in the browser is what is verified — not a reimplementation of
 * it. `new Function` is safe here: the body is a module constant built only
 * from two compile-time string literals via JSON.stringify, with no runtime or
 * user input interpolated into it.
 */
describe("pre-paint init script", () => {
  it("applies the stored value before React runs", async () => {
    const { SIDEBAR_INIT_SCRIPT } = await import("@/lib/sidebar-preference");

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    new Function(SIDEBAR_INIT_SCRIPT)();
    expect(readAppliedSidebarState()).toBe("collapsed");

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "expanded");
    new Function(SIDEBAR_INIT_SCRIPT)();
    expect(readAppliedSidebarState()).toBe("expanded");
  });

  it("applies expanded for a garbage stored value", async () => {
    const { SIDEBAR_INIT_SCRIPT } = await import("@/lib/sidebar-preference");
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "banana");
    new Function(SIDEBAR_INIT_SCRIPT)();
    expect(readAppliedSidebarState()).toBe("expanded");
  });

  it("never leaves the attribute unset, even if storage throws", async () => {
    const { SIDEBAR_INIT_SCRIPT } = await import("@/lib/sidebar-preference");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    new Function(SIDEBAR_INIT_SCRIPT)();
    expect(readAppliedSidebarState()).toBe("expanded");
  });
});
