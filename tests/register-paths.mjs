import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC_DIR = path.resolve(process.cwd(), "src");

function resolveTsFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

const NEXT_SUBPATH_ALIASES = new Map([
  ["next/headers", "next/headers.js"],
  ["next/server", "next/server.js"],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const nextAlias = NEXT_SUBPATH_ALIASES.get(specifier);
    if (nextAlias) {
      return nextResolve(nextAlias, context);
    }

    if (specifier.startsWith("@/")) {
      const target = path.join(SRC_DIR, specifier.slice(2));
      const resolvedUrl = resolveTsFile(target);
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true };
      }
    }

    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const target = path.resolve(parentDir, specifier);
      const resolvedUrl = resolveTsFile(target);
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
