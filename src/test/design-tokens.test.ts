import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("src/app/globals.css", "utf8");

function tokenBlock(selector: string): Map<string, string> {
  const pattern = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = CSS.match(pattern);
  if (!match?.[1]) throw new Error(`token block not found: ${selector}`);
  return new Map(
    [...match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1] as string,
      (m[2] as string).trim(),
    ]),
  );
}

/* ---------------------------------------------------------------- colour ---- */

type RGB = [number, number, number];

function oklchToSrgb(L: number, C: number, H: number): RGB {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.089484177 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  }) as RGB;
}

function parseOklch(value: string): { rgb: RGB; alpha: number } {
  const inner = value.match(/oklch\(([^)]+)\)/)?.[1];
  if (!inner) throw new Error(`not an oklch value: ${value}`);
  const [coords, alphaPart] = inner.split("/");
  const [L, C, H] = (coords ?? "").trim().split(/\s+/).map(Number);
  return {
    rgb: oklchToSrgb(L ?? 0, C ?? 0, H ?? 0),
    alpha: alphaPart === undefined ? 1 : Number(alphaPart.trim()),
  };
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a translucent colour over an opaque backdrop. */
function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return fg.map((c, i) => c * alpha + (bg[i] as number) * (1 - alpha)) as RGB;
}

const THEMES = [
  { name: "light", tokens: tokenBlock(":root") },
  { name: "dark", tokens: tokenBlock("\\.dark") },
] as const;

/* ------------------------------------------------------------------ tests ---- */

describe("design tokens", () => {
  it("defines the semantic tokens the architecture requires", () => {
    const required = [
      "background",
      "foreground",
      "surface",
      "surface-elevated",
      "surface-glass",
      "border",
      "border-strong",
      "primary",
      "primary-foreground",
      "muted",
      "muted-foreground",
      "success",
      "warning",
      "danger",
      "info",
      "ring",
      "surface-glass-strong",
      "surface-glass-border",
      "surface-glass-highlight",
      "ambient-indigo",
      "ambient-cyan",
      "ambient-cyan-low",
      "ambient-indigo-low",
    ];
    for (const { name, tokens } of THEMES) {
      for (const token of required) {
        expect(tokens.has(token), `${name} is missing --${token}`).toBe(true);
      }
    }
  });

  it("lets the dark theme override values, never introduce new tokens", () => {
    // Theme switching must change VALUES only. A token that exists only in the
    // dark block would mean the two themes diverge structurally.
    const [light, dark] = THEMES;
    const lightKeys = [...light.tokens.keys()];
    const darkOnly = [...dark.tokens.keys()].filter(
      (k) => !lightKeys.includes(k),
    );

    expect(darkOnly).toEqual([]);
  });

  it("overrides every colour token in the dark theme", () => {
    // Non-colour tokens (--radius, --glass-blur, --glass-saturate) are
    // deliberately theme-independent and inherit from :root. Every token that
    // carries a colour must be restated, or dark would inherit a light value.
    const [light, dark] = THEMES;
    const missing = [...light.tokens.entries()]
      .filter(([, value]) => value.includes("oklch("))
      .map(([key]) => key)
      .filter((key) => !dark.tokens.has(key));

    expect(missing).toEqual([]);
  });

  it("exposes every colour token as a Tailwind utility", () => {
    const themeBlock = CSS.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    for (const token of [
      "background",
      "foreground",
      "surface",
      "surface-elevated",
      "surface-glass",
      "border",
      "border-strong",
      "primary",
      "muted-foreground",
      "success",
      "warning",
      "danger",
      "info",
    ]) {
      expect(themeBlock).toContain(`--color-${token}: var(--${token});`);
    }
  });
});

describe("contrast (WCAG 2.1 AA)", () => {
  for (const { name, tokens } of THEMES) {
    const rgb = (key: string) => parseOklch(tokens.get(key) as string).rgb;
    const withAlpha = (key: string) => parseOklch(tokens.get(key) as string);

    /**
     * Representative backdrops across the ambient field.
     *
     * The ambient layer sits behind the whole shell, so text no longer sits on
     * a single flat colour. These are the peak of each gradient source
     * composited over the base — the worst case a reader actually encounters,
     * since the gradients fade outward from these points.
     */
    const base = rgb("background");
    const ambient = (key: string): RGB => {
      const a = withAlpha(key);
      return over(a.rgb, a.alpha, base);
    };

    const BACKDROPS: [string, RGB][] = [
      ["neutral background", base],
      ["strongest indigo", ambient("ambient-indigo")],
      ["strongest cyan", ambient("ambient-cyan")],
      ["secondary cyan", ambient("ambient-cyan-low")],
      ["secondary indigo", ambient("ambient-indigo-low")],
    ];

    /** Each backdrop as seen through the two glass tiers. */
    const throughGlass = (key: string): [string, RGB][] =>
      BACKDROPS.map(([label, backdrop]) => {
        const g = withAlpha(key);
        return [
          `${label} through ${key}`,
          g.alpha < 1 ? over(g.rgb, g.alpha, backdrop) : g.rgb,
        ];
      });

    const ALL_BACKDROPS: [string, RGB][] = [
      ...BACKDROPS,
      ...throughGlass("surface-glass"),
      ...throughGlass("surface-glass-strong"),
      ["surface", rgb("surface")],
      ["surface-elevated", rgb("surface-elevated")],
    ];

    describe(name, () => {
      it("body text reaches 4.5:1 everywhere on the ambient field", () => {
        for (const [label, backdrop] of ALL_BACKDROPS) {
          expect(
            contrast(rgb("foreground"), backdrop),
            `foreground on ${label}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });

      it("muted text reaches 4.5:1 everywhere on the ambient field", () => {
        for (const [label, backdrop] of ALL_BACKDROPS) {
          expect(
            contrast(rgb("muted-foreground"), backdrop),
            `muted-foreground on ${label}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });

      it("primary button text reaches 4.5:1", () => {
        expect(
          contrast(rgb("primary-foreground"), rgb("primary")),
        ).toBeGreaterThanOrEqual(4.5);
      });

      it("focus ring reaches 3:1 everywhere on the ambient field", () => {
        for (const [label, backdrop] of ALL_BACKDROPS) {
          expect(
            contrast(rgb("ring"), backdrop),
            `ring on ${label}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });

      it("strong borders reach 3:1 on the base surfaces (WCAG 1.4.11)", () => {
        for (const backdrop of ["background", "surface"] as const) {
          expect(
            contrast(rgb("border-strong"), rgb(backdrop)),
            `border-strong on ${backdrop}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });

      it("status chip text reaches 4.5:1 on its own chip background", () => {
        for (const tone of [
          "success",
          "warning",
          "danger",
          "info",
          "neutral",
        ]) {
          const chip = withAlpha(`${tone}-subtle`);
          const backdrop =
            chip.alpha < 1 ? over(chip.rgb, chip.alpha, base) : chip.rgb;
          expect(
            contrast(rgb(`${tone}-on-subtle`), backdrop),
            `${tone} chip`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    });
  }
});

describe("no hard-coded theme colours in components", () => {
  /**
   * global-error.tsx is the one legitimate exception: it replaces the whole
   * document when the root layout fails, so it cannot rely on application CSS
   * and must inline its own minimal styling.
   */
  const EXEMPT_FILES = ["src/app/global-error.tsx"];

  /**
   * The `themeColor` viewport entries set the browser's own UI chrome. The
   * platform requires a literal colour there — a CSS variable is not resolvable
   * in that context — so those lines are exempt by content, not by file.
   */
  const EXEMPT_LINE = /prefers-color-scheme/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.tsx?$/.test(entry)) out.push(path);
    }
    return out;
  }

  it("uses semantic tokens rather than literal colour values", () => {
    const offenders: string[] = [];
    const colourLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;

    for (const file of [...walk("src/components"), ...walk("src/app")]) {
      if (EXEMPT_FILES.includes(file)) continue;
      for (const [index, line] of readFileSync(file, "utf8")
        .split("\n")
        .entries()) {
        if (EXEMPT_LINE.test(line)) continue;
        if (colourLiteral.test(line)) offenders.push(`${file}:${index + 1}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
