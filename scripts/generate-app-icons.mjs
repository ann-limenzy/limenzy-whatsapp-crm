/**
 * Derive the installable application icons from the approved Limenzy logo.
 *
 * Milestone 1E asks for icons "derived from the approved Limenzy chevron
 * symbol — normal and maskable, with safe-zone padding", and for the original
 * SVG assets to be "preserved and never edited". So this reads
 * `public/brand/limenzy-glass-logo-light.svg`, never writes to it, and emits
 * new files under `public/icons/`.
 *
 * The chevron is isolated by rendering and cropping rather than by parsing
 * path geometry: the wordmark starts at x≈71 in the logo's 221-wide viewBox,
 * so everything left of that is the mark. `trim()` then finds its exact bounds,
 * which is more reliable than computing a bounding box from path commands with
 * curves and relative coordinates.
 *
 * Two purposes, per the Web App Manifest spec:
 *
 *   * `any`      — the icon as drawn, with modest padding. Used where the
 *                  platform does not crop.
 *   * `maskable` — the platform may crop to a circle or squircle, and only the
 *                  central 80% of the width is guaranteed visible. The mark is
 *                  therefore drawn into a 60% safe zone, which leaves room for
 *                  the most aggressive masks without clipping the symbol.
 *
 * Re-run with:  node scripts/generate-app-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "public/brand/limenzy-glass-logo-light.svg");
const OUT_DIR = join(ROOT, "public/icons");

/** The ground colour of the light theme, so the tile matches the product. */
const BACKGROUND = { r: 250, g: 251, b: 254, alpha: 1 };

/** Rendered wide enough that the cropped mark is still far above 512px. */
const RENDER_WIDTH = 4420; // 20× the logo's 221pt width
/** The wordmark begins at x≈71/221; crop well before it. */
const MARK_FRACTION = 60 / 221;

async function markBuffer() {
  const rendered = await sharp(SOURCE, { density: 600 })
    .resize({ width: RENDER_WIDTH })
    .png()
    .toBuffer();

  const { width, height } = await sharp(rendered).metadata();
  if (!width || !height) throw new Error("could not measure the rendered logo");

  return (
    sharp(rendered)
      .extract({
        left: 0,
        top: 0,
        width: Math.round(width * MARK_FRACTION),
        height,
      })
      // Tight bounds around the symbol itself, whatever its exact geometry.
      .trim()
      .png()
      .toBuffer()
  );
}

/** One square icon: the mark centred on an opaque tile at the given inset. */
async function icon(mark, size, safeZoneFraction) {
  const inner = Math.round(size * safeZoneFraction);
  const resized = await sharp(mark)
    .resize({
      width: inner,
      height: inner,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png()
    .toBuffer();
}

const TARGETS = [
  // purpose "any": a little breathing room, nothing is cropped.
  { name: "icon-192.png", size: 192, safeZone: 0.78 },
  { name: "icon-512.png", size: 512, safeZone: 0.78 },
  // purpose "maskable": only the central 80% is guaranteed, so draw into 60%.
  { name: "icon-maskable-192.png", size: 192, safeZone: 0.6 },
  { name: "icon-maskable-512.png", size: 512, safeZone: 0.6 },
  // Apple touch icon: iOS does not mask, but it does not pad either.
  { name: "apple-touch-icon.png", size: 180, safeZone: 0.72 },
];

await mkdir(OUT_DIR, { recursive: true });
const mark = await markBuffer();
const trimmed = await sharp(mark).metadata();
console.log(`chevron cropped to ${trimmed.width}×${trimmed.height}`);

for (const target of TARGETS) {
  const buffer = await icon(mark, target.size, target.safeZone);
  await writeFile(join(OUT_DIR, target.name), buffer);
  console.log(`  wrote public/icons/${target.name} (${target.size}px)`);
}
