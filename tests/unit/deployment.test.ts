import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Deployment guards — Architecture §4.3, §5.15.2.
 *
 * Vercel runs the API on the Node.js runtime. Native/database modules must not
 * leak into the middleware bundle, which is evaluated before the application.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "src");
const API_ROOT = join(SRC, "app", "api");
const MIDDLEWARE = join(SRC, "middleware.ts");

const NODE_RUNTIME = /export\s+const\s+runtime\s*=\s*["']nodejs["']/;
const DYNAMIC = /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/;

const NODE_BUILTINS = new Set([
  "async_hooks",
  "buffer",
  "child_process",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "tls",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]);

const FORBIDDEN_LOCAL_PREFIXES = [
  join("src", "lib", "db"),
  join("src", "lib", "auth", "password"),
  join("src", "lib", "services"),
];

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(fullPath);
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function resolveLocalFile(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;

  if (!base) return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  return null;
}

function isForbiddenSpecifier(specifier: string, resolved: string | null): boolean {
  const bareName = specifier.split("/")[0] ?? specifier;

  if (
    specifier.startsWith("node:") ||
    NODE_BUILTINS.has(bareName) ||
    specifier === "postgres" ||
    specifier.startsWith("postgres/") ||
    specifier === "mongodb" ||
    specifier.startsWith("mongodb/") ||
    specifier === "drizzle-orm" ||
    specifier.startsWith("drizzle-orm/") ||
    specifier === "@node-rs/argon2" ||
    specifier.startsWith("@node-rs/argon2/")
  ) {
    return true;
  }

  if (!resolved) return false;
  const fromRoot = relative(ROOT, resolved);
  return FORBIDDEN_LOCAL_PREFIXES.some(
    (prefix) => fromRoot === prefix || fromRoot.startsWith(`${prefix}/`),
  );
}

interface ImportEdge {
  from: string;
  specifier: string;
  resolved: string | null;
}

function collectImportGraph(entryPoint: string): ImportEdge[] {
  const seen = new Set<string>();
  const edges: ImportEdge[] = [];
  const pending = [entryPoint];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, "utf8");
    const { importedFiles } = ts.preProcessFile(source, true, true);

    for (const imported of importedFiles) {
      const resolved = resolveLocalFile(imported.fileName, file);
      edges.push({ from: file, specifier: imported.fileName, resolved });
      if (resolved && !seen.has(resolved)) pending.push(resolved);
    }
  }

  return edges;
}

describe("deployment runtime", () => {
  it("opts every API route handler into the Node.js runtime and dynamic rendering", () => {
    const routeFiles = collectRouteFiles(API_ROOT);
    expect(routeFiles.length).toBeGreaterThan(0);

    const missingRuntime = routeFiles.filter(
      (file) => !NODE_RUNTIME.test(readFileSync(file, "utf8")),
    );
    const missingDynamic = routeFiles.filter((file) => !DYNAMIC.test(readFileSync(file, "utf8")));

    expect(missingRuntime.map((file) => relative(ROOT, file))).toEqual([]);
    expect(missingDynamic.map((file) => relative(ROOT, file))).toEqual([]);
  });

  it("keeps native and database modules out of the middleware import graph", () => {
    const edges = collectImportGraph(MIDDLEWARE);
    expect(edges.length).toBeGreaterThan(0);

    const forbidden = edges.filter((edge) => isForbiddenSpecifier(edge.specifier, edge.resolved));
    expect(forbidden.map((edge) => `${relative(ROOT, edge.from)} -> ${edge.specifier}`)).toEqual(
      [],
    );

    const unresolvedLocal = edges.filter(
      (edge) =>
        (edge.specifier.startsWith("@/") || edge.specifier.startsWith(".")) && !edge.resolved,
    );
    expect(unresolvedLocal.map((edge) => edge.specifier)).toEqual([]);
  });
});
