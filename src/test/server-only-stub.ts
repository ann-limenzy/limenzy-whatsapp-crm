/**
 * Test stub for the `server-only` package.
 *
 * The real package resolves to a module that throws unless it is loaded in a
 * server bundle, which is exactly the protection we want in the application
 * and exactly what makes those modules untestable under Vitest. Aliasing it
 * here removes the guard for tests only; the production import is untouched,
 * so a client component importing a server module is still a build error.
 */
export {};
