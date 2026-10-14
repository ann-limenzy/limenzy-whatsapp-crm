/**
 * The two ground colours, in sRGB, for surfaces that cannot read CSS tokens.
 *
 * The browser chrome colour and the installed application's splash background
 * are set through `<meta name="theme-color">` and the web app manifest, and
 * neither can resolve a CSS custom property. They therefore need literal
 * values — and the moment a literal exists, it can drift from the token it was
 * copied from. That had already happened: the values in the root layout were
 * `#fafbfe` and `#0b0f1a`, while `--background` in `globals.css` had moved to
 * `oklch(0.982 0.008 250)` and `oklch(0.205 0.036 266)` during the
 * ambient-field revision, which convert to the values below.
 *
 * Keeping them here means one place to correct when the tokens move again, and
 * a test can convert the tokens and compare, which is what catches the next
 * drift rather than a person noticing the browser chrome looks slightly wrong.
 *
 * Derived from `--background` in `src/app/globals.css`:
 *   light  oklch(0.982 0.008 250)  →  #f5fafe
 *   dark   oklch(0.205 0.036 266)  →  #0f1728
 */
export const GROUND_LIGHT = "#f5fafe";
export const GROUND_DARK = "#0f1728";

/**
 * The manifest's `background_color`, painted before the application renders.
 *
 * The light ground, deliberately, and not the dark one: a manifest carries a
 * single value with no media query, and a launch that flashes near-white then
 * settles is less jarring than one that flashes near-black. The theme itself
 * still follows the system setting once the document loads.
 */
export const MANIFEST_BACKGROUND = GROUND_LIGHT;

/**
 * The manifest's `theme_color`.
 *
 * Also the light ground rather than the brand accent: this colours the
 * title bar of the installed window, which sits directly above the
 * application's own background.
 */
export const MANIFEST_THEME = GROUND_LIGHT;
