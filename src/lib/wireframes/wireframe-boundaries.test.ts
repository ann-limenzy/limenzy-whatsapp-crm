import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SEQUENCE } from "@/lib/wireframes/flows";

/**
 * Boundaries around the wireframes.
 *
 * Every internal wireframe link must land on a real route, and the
 * production application must never depend on wireframe code.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(path);
  }
  return out;
}

/** Source without comment lines, so documentation examples are not scanned. */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!;
  return existsSync(join("src/app", path, "page.tsx"));
}

const WIREFRAME_SOURCES = [
  ...walk("src/components/wireframes"),
  ...walk("src/lib/wireframes"),
  ...walk("src/app/wireframes"),
];

describe("wireframe links", () => {
  it("resolves every registered step", () => {
    for (const step of SEQUENCE) {
      expect(routeExists(step.href), step.href).toBe(true);
    }
  });

  it("resolves every literal /wireframes link in wireframe code", () => {
    const missing: string[] = [];
    for (const file of WIREFRAME_SOURCES) {
      const source = codeOnly(readFileSync(file, "utf8"));
      for (const match of source.matchAll(
        /["'`](\/wireframes[^"'`\s$]*)["'`]/g,
      )) {
        const href = match[1]!;
        if (!routeExists(href)) missing.push(`${file}: ${href}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("production isolation", () => {
  it("never imports wireframe code outside the wireframes", () => {
    const production = [
      ...walk("src/app").filter(
        (f) => !f.startsWith(join("src/app", "wireframes")),
      ),
      ...walk("src/components").filter(
        (f) => !f.startsWith(join("src/components", "wireframes")),
      ),
      ...walk("src/server"),
      ...walk("src/lib").filter(
        (f) => !f.startsWith(join("src/lib", "wireframes")),
      ),
      ...walk("src/config"),
    ];
    const offenders = production.filter((file) =>
      /from\s+["']@\/(?:components|lib)\/wireframes/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the Sales Team wireframes free of data access, dialling and external links", () => {
    const files = WIREFRAME_SOURCES.filter((f) =>
      /sales-team|lead-assignment|teams[/\\]/.test(f),
    );
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const file of files) {
      const source = codeOnly(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(
        /supabase|fetch\(|["']use server["']|tel:|https?:\/\//i,
      );
    }
  });
});
