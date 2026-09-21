import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The tenant import boundary.
 *
 * Reaching the database outside `withTenant()` runs queries with no tenant
 * context. Because the Phase-2 policies fail closed, the result is not an
 * error — it is an empty result set, which reads like "no data" rather than
 * like a security failure. That is why this is a lint rule and not a comment.
 *
 * The allow-list below is by exact file, not by directory. A future repository
 * or service placed inside `src/server/db/` is production code and is policed
 * exactly like anything under `src/app` or `src/lib`; only the two files that
 * genuinely implement the gateway are exempt, and each only for what it needs.
 */

/** Raw driver / client-construction packages. */
const DRIVER_IMPORTS = [
  {
    name: "postgres",
    message:
      "Do not open a database connection directly. Tenant-scoped work goes " +
      "through withTenant() in @/server/db/tenant.",
  },
  {
    name: "drizzle-orm/postgres-js",
    message:
      "Do not construct a Drizzle client. Use withTenant() in " +
      "@/server/db/tenant; repositories receive the transaction handle.",
  },
];

/**
 * The runtime pool, by every spelling that reaches it — aliased or relative.
 * Patterns match the import specifier as written, so both forms are listed.
 */
const RAW_CLIENT_PATTERNS = {
  group: [
    "**/server/db/client",
    "./client",
    "../client",
    "../db/client",
    "./db/client",
  ],
  message:
    "The runtime pool is not application API. Use withTenant() in " +
    "@/server/db/tenant.",
};

/** The trusted context constructor. */
const CONTEXT_PATTERNS = {
  group: [
    "**/server/db/tenant-context",
    "./tenant-context",
    "../tenant-context",
    "../db/tenant-context",
  ],
  message:
    "createTenantContext() is a trusted boundary reserved for the workspace " +
    "context resolver. Application code receives a context; it never mints one.",
};

/** The tooling (superuser) connection must never be named by production code. */
const NO_TOOLING_CONNECTION = [
  {
    selector:
      "Literal[value='DRIZZLE_TOOLING_DATABASE_URL'], Identifier[name='DRIZZLE_TOOLING_DATABASE_URL']",
    message:
      "DRIZZLE_TOOLING_DATABASE_URL is a superuser connection that bypasses " +
      "row-level security. Production code uses DATABASE_URL through " +
      "withTenant() only.",
  },
];

/** Exempt from the whole-tree rule, each for a stated reason. */
const GATEWAY_FILES = {
  /** Creates the pool: the one place the driver may be imported. */
  client: "src/server/db/client.ts",
  /** Consumes the pool and the context marker: the gateway itself. */
  tenant: "src/server/db/tenant.ts",
};

const TEST_FILES = ["src/**/*.test.{ts,tsx}", "src/test/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    /**
     * Every production source file, including everything under
     * `src/server/db/**` that is not one of the two gateway files. Tests are
     * excluded because they must reach the pool to prove the boundary holds.
     */
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...TEST_FILES, GATEWAY_FILES.client, GATEWAY_FILES.tenant],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: DRIVER_IMPORTS,
          patterns: [RAW_CLIENT_PATTERNS, CONTEXT_PATTERNS],
        },
      ],
      "no-restricted-syntax": ["error", ...NO_TOOLING_CONNECTION],
    },
  },
  {
    /**
     * The pool factory. It may import the driver — that is its entire job —
     * but it still may not mint a tenant context or name the tooling
     * connection.
     */
    files: [GATEWAY_FILES.client],
    rules: {
      "no-restricted-imports": ["error", { patterns: [CONTEXT_PATTERNS] }],
      "no-restricted-syntax": ["error", ...NO_TOOLING_CONNECTION],
    },
  },
  {
    /**
     * The gateway. It may consume the pool and read the context marker, but it
     * has no business importing the driver directly or naming the tooling
     * connection.
     */
    files: [GATEWAY_FILES.tenant],
    rules: {
      "no-restricted-imports": ["error", { paths: DRIVER_IMPORTS }],
      "no-restricted-syntax": ["error", ...NO_TOOLING_CONNECTION],
    },
  },
]);

export default eslintConfig;
