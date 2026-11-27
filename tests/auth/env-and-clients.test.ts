import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { loadEnvLocal } from "../../scripts/load-env-local.mjs";
import { getPublicSupabaseConfig, isValidHttpUrl } from "@/lib/config/env";
import { getServerSupabaseAdminConfig } from "@/lib/config/server-env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSupabaseBearerClient } from "@/lib/supabase/server";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Environment validation", () => {
  it("validates HTTP/HTTPS URLs cleanly", () => {
    assert.equal(isValidHttpUrl("https://example.supabase.co"), true);
    assert.equal(isValidHttpUrl("http://127.0.0.1:54321"), true);
    assert.equal(isValidHttpUrl("ftp://invalid.supabase.co"), false);
    assert.equal(isValidHttpUrl("not-a-url"), false);
    assert.equal(isValidHttpUrl(""), false);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL or anon key is missing/invalid", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";

    assert.throws(() => getPublicSupabaseConfig(), /NEXT_PUBLIC_SUPABASE_URL/);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testing.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    assert.throws(() => getPublicSupabaseConfig(), /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("supports NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fallback", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testing.supabase.co/";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    const cfg = getPublicSupabaseConfig();
    assert.equal(cfg.url, "https://testing.supabase.co");
    assert.equal(cfg.anonKey, "sb_publishable_test");
  });

  it("requires SUPABASE_SERVICE_ROLE_KEY strictly on server-env", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testing.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";

    assert.throws(() => getServerSupabaseAdminConfig(), /SUPABASE_SERVICE_ROLE_KEY/);

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-test";
    const adminCfg = getServerSupabaseAdminConfig();
    assert.equal(adminCfg.url, "https://testing.supabase.co");
    assert.equal(adminCfg.serviceRoleKey, "service-role-secret-test");
  });

  it("loads .env.local reliably with quote stripping and empty-value override", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pinjam-env-test-"));
    const tmpEnv = path.join(tmpDir, ".env.local");
    fs.writeFileSync(
      tmpEnv,
      [
        "# Comment line",
        'NEXT_PUBLIC_SUPABASE_URL="https://testing.supabase.co"',
        "export NEXT_PUBLIC_SUPABASE_ANON_KEY='anon_from_file'",
        "SUPABASE_SERVICE_ROLE_KEY=svc_from_file",
      ].join("\n")
    );

    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "";
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "keep_explicit_shell_value";

      const result = loadEnvLocal({ envPath: tmpEnv });
      assert.equal(result.loaded, true);
      assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://testing.supabase.co");
      assert.equal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "anon_from_file");
      assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, "keep_explicit_shell_value");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("Supabase client configuration & secret isolation", () => {
  it("constructs browser, bearer, and admin clients without sharing service key in client files", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testing.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";

    const browserClient = createSupabaseBrowserClient();
    const bearerClient = createSupabaseBearerClient("jwt-token-test");
    const adminClient = createSupabaseAdminClient();

    assert.ok(browserClient.auth);
    assert.ok(bearerClient.auth);
    assert.ok(adminClient.auth);

    const browserSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/supabase/browser.ts"),
      "utf8"
    );
    const clientAuthSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/auth/client-auth.ts"),
      "utf8"
    );
    const publicEnvSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/config/env.ts"),
      "utf8"
    );
    const adminSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/supabase/admin.ts"),
      "utf8"
    );

    assert.doesNotMatch(
      browserSource,
      /process\.env\.SUPABASE_SERVICE_ROLE_KEY|from\s+["']server-only["']|import\s+["']server-only["']|@\/lib\/supabase\/admin|@\/lib\/config\/server-env/
    );
    assert.doesNotMatch(
      clientAuthSource,
      /process\.env\.SUPABASE_SERVICE_ROLE_KEY|from\s+["']server-only["']|import\s+["']server-only["']|@\/lib\/supabase\/admin|@\/lib\/config\/server-env/
    );
    assert.doesNotMatch(publicEnvSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(adminSource, /import "server-only";/);
  });
});
