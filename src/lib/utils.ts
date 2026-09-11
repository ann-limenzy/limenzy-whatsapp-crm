/**
 * Shared class-name helper.
 *
 * The implementation is the official `cn` package (github.com/shadcn-ui/cn),
 * which is what the shadcn/ui generator emits. Re-exported here so that
 * application code has a single, stable import path (`@/lib/utils`) alongside
 * any future shared utilities, and so the `aliases.utils` entry in
 * components.json resolves.
 */
export { cn } from "cn";
