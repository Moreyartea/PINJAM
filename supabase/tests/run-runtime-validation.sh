#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# PINJAM Database Foundation — Runtime Validation Runner (Migrations 001..010)
# ============================================================================
# Usage:
#   TEST_DATABASE_URL="postgresql://postgres:<password>@db.<test-ref>.supabase.co:5432/postgres?sslmode=require" \
#     bash supabase/tests/run-runtime-validation.sh
#
# Safety:
#   - NEVER pass a production or active PINJAM database URL.
#   - Requires explicit TEST_DATABASE_URL; never stores or reads hardcoded creds.
# ============================================================================

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  echo "ERROR: TEST_DATABASE_URL is not set." >&2
  echo "Provide a dedicated TESTING PostgreSQL / Supabase connection string via TEST_DATABASE_URL." >&2
  exit 1
fi

TEST_DB_LOWER="$(printf '%s' "$TEST_DATABASE_URL" | tr '[:upper:]' '[:lower:]')"
if [[ "$TEST_DB_LOWER" == *"prod"* ]] && [[ "${ALLOW_PROD_LIKE_TEST_NAME:-}" != "true" ]]; then
  echo "ERROR: Refusing to run because TEST_DATABASE_URL contains 'prod'." >&2
  exit 1
fi

PSQL_BIN="$(command -v psql || true)"
if [[ -z "$PSQL_BIN" && -x "/opt/homebrew/opt/libpq/bin/psql" ]]; then
  PSQL_BIN="/opt/homebrew/opt/libpq/bin/psql"
fi

if [[ -z "$PSQL_BIN" ]]; then
  echo "ERROR: psql binary not found in PATH or /opt/homebrew/opt/libpq/bin/psql." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

echo "==> Checking connectivity to TEST_DATABASE_URL using $PSQL_BIN..."
"$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT version();" >/dev/null

echo "==> Applying migrations 001..010 sequentially..."
for migration in "$MIGRATIONS_DIR"/*.sql; do
  echo "    Applying $(basename "$migration")..."
  "$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

echo "==> Running transactional schema, trigger, QR & RLS suite (verify-database-foundation.sql)..."
"$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/verify-database-foundation.sql"

echo "==> Running two-connection concurrency tests (verify-concurrency.sh)..."
PSQL_BIN="$PSQL_BIN" bash "$SCRIPT_DIR/verify-concurrency.sh"

echo "OK: Runtime validation (migrations 001..010, triggers, QR, RLS, concurrency) passed."
