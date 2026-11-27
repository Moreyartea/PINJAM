import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function stripOuterQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Loads key=value pairs from .env.local into process.env when a key is
 * missing or blank in the current process environment.
 */
export function loadEnvLocal(options = {}) {
  const envPath = options.envPath ?? path.join(DEFAULT_REPO_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    return { loaded: false, envPath, keysLoaded: [] };
  }

  const keysLoaded = [];
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const line = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1).trim();
    const value = stripOuterQuotes(rawValue);

    const existing = process.env[key];
    if (existing === undefined || existing.trim() === "") {
      process.env[key] = value;
      keysLoaded.push(key);
    }
  }

  return { loaded: true, envPath, keysLoaded };
}
