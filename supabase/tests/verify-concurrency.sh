#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# PINJAM Database Foundation — Two-Connection Concurrency Verification
# ============================================================================
# Tests real parallel PostgreSQL sessions against TEST_DATABASE_URL for:
#   1. Idempotency key reservation race (IN_PROGRESS lock via ON CONFLICT)
#   2. Concurrent overlapping booking creation on same projector (GiST exclusion)
#   3. Concurrent pickup conversion from booking -> loan (row lock + unique booking_id)
# ============================================================================

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  echo "ERROR: TEST_DATABASE_URL must be set to a dedicated testing database." >&2
  exit 1
fi

PSQL_BIN="${PSQL_BIN:-$(command -v psql || true)}"
if [[ -z "$PSQL_BIN" && -x "/opt/homebrew/opt/libpq/bin/psql" ]]; then
  PSQL_BIN="/opt/homebrew/opt/libpq/bin/psql"
fi

if [[ -z "$PSQL_BIN" ]]; then
  echo "ERROR: psql binary not found." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  "$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<'SQL'
DELETE FROM public.idempotency_records WHERE idempotency_key LIKE 'conc-idem-%';
DELETE FROM public.loans WHERE booking_id IN (SELECT id FROM public.bookings WHERE booking_code LIKE 'BKG-CONC-%');
DELETE FROM public.bookings WHERE booking_code LIKE 'BKG-CONC-%';
DELETE FROM public.projectors WHERE asset_code LIKE 'PRJ-CONC-%';
DELETE FROM public.users WHERE email LIKE 'conc-%@example.test';
SQL
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "==> Seeding isolated concurrency test fixtures..."
"$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -t -A >"$TMP_DIR/ids.txt" <<'SQL'
WITH u1 AS (
  INSERT INTO public.users (email, full_name, role, account_status)
  VALUES ('conc-komting1@example.test', 'Conc Komting 1', 'KOMTING', 'ACTIVE')
  RETURNING id
), u2 AS (
  INSERT INTO public.users (email, full_name, role, account_status)
  VALUES ('conc-komting2@example.test', 'Conc Komting 2', 'KOMTING', 'ACTIVE')
  RETURNING id
), st AS (
  INSERT INTO public.users (email, full_name, role, account_status)
  VALUES ('conc-staff@example.test', 'Conc Staff', 'STAFF', 'ACTIVE')
  RETURNING id
), p1 AS (
  INSERT INTO public.projectors (asset_code, name, physical_status, is_active)
  VALUES ('PRJ-CONC-001', 'Conc Projector 1', 'AVAILABLE', TRUE)
  RETURNING id
), p2 AS (
  INSERT INTO public.projectors (asset_code, name, physical_status, is_active)
  VALUES ('PRJ-CONC-002', 'Conc Projector 2', 'AVAILABLE', TRUE)
  RETURNING id
), b_pick AS (
  INSERT INTO public.bookings (
    booking_code, komting_id, projector_id, booking_date, start_time,
    estimated_return_at, status, operating_hours_snapshot,
    pickup_window_start_at, pickup_window_end_at
  )
  SELECT
    'BKG-CONC-PICKUP', u1.id, p2.id,
    ((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1), TIME '09:00:00',
    ((((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1) + TIME '11:00:00') AT TIME ZONE 'Asia/Jakarta'),
    'CONFIRMED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
    ((((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1) + TIME '08:30:00') AT TIME ZONE 'Asia/Jakarta'),
    ((((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1) + TIME '09:15:00') AT TIME ZONE 'Asia/Jakarta')
  FROM u1, p2
  RETURNING id
)
SELECT u1.id || '|' || u2.id || '|' || st.id || '|' || p1.id || '|' || p2.id || '|' || b_pick.id
FROM u1, u2, st, p1, p2, b_pick;
SQL

IFS='|' read -r U1_ID U2_ID STAFF_ID P1_ID P2_ID BPICK_ID <"$TMP_DIR/ids.txt"

echo "==> [1/3] Testing concurrent Idempotency-Key reservation..."
run_idem() {
  local out="$1"
  "$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -t -A >"$out" 2>"$out.err" <<SQL
INSERT INTO public.idempotency_records (
  idempotency_key, actor_user_id, route_or_operation, request_hash, status, expires_at
) VALUES (
  'conc-idem-001', '$U1_ID', 'POST /api/v1/bookings', 'sha256_conc', 'IN_PROGRESS', NOW() + INTERVAL '1 hour'
)
ON CONFLICT DO NOTHING
RETURNING id;
SQL
}

run_idem "$TMP_DIR/idem1.out" &
PID1=$!
run_idem "$TMP_DIR/idem2.out" &
PID2=$!
wait "$PID1" "$PID2"

WINS=$(( $(grep -cE '^[0-9a-f-]{36}$' "$TMP_DIR/idem1.out" || true) + $(grep -cE '^[0-9a-f-]{36}$' "$TMP_DIR/idem2.out" || true) ))
if [[ "$WINS" -ne 1 ]]; then
  echo "ERROR: Expected exactly 1 idempotency winner, got $WINS" >&2
  exit 1
fi
echo "    PASS: Exactly 1 concurrent session acquired IN_PROGRESS idempotency lock."

echo "==> [2/3] Testing concurrent overlapping bookings on same projector..."
run_booking() {
  local uid="$1"
  local code="$2"
  local out="$3"
  "$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -t -A >"$out" 2>"$out.err" <<SQL || true
BEGIN;
SELECT pg_sleep(0.1);
INSERT INTO public.bookings (
  booking_code, komting_id, projector_id, booking_date, start_time,
  estimated_return_at, status, operating_hours_snapshot,
  pickup_window_start_at, pickup_window_end_at
) VALUES (
  '$code', '$uid', '$P1_ID',
  ((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1), TIME '10:00:00',
  ((((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1) + TIME '12:00:00') AT TIME ZONE 'Asia/Jakarta'),
  'CONFIRMED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
  ((((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1) + TIME '09:30:00') AT TIME ZONE 'Asia/Jakarta'),
  ((((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1) + TIME '10:15:00') AT TIME ZONE 'Asia/Jakarta')
) RETURNING id;
COMMIT;
SQL
}

run_booking "$U1_ID" "BKG-CONC-1" "$TMP_DIR/bkg1.out" &
PID1=$!
run_booking "$U2_ID" "BKG-CONC-2" "$TMP_DIR/bkg2.out" &
PID2=$!
wait "$PID1" "$PID2"

BKG_OK=$(( $(grep -cE '^[0-9a-f-]{36}$' "$TMP_DIR/bkg1.out" || true) + $(grep -cE '^[0-9a-f-]{36}$' "$TMP_DIR/bkg2.out" || true) ))
BKG_EXCL=$(( $(grep -c 'excl_bookings_no_overlap_per_projector' "$TMP_DIR/bkg1.out.err" || true) + $(grep -c 'excl_bookings_no_overlap_per_projector' "$TMP_DIR/bkg2.out.err" || true) ))
if [[ "$BKG_OK" -ne 1 || "$BKG_EXCL" -ne 1 ]]; then
  echo "ERROR: Expected 1 booking commit and 1 exclusion_violation (ok=$BKG_OK, excl=$BKG_EXCL)" >&2
  exit 1
fi
echo "    PASS: Exactly 1 concurrent booking committed; 1 rejected by excl_bookings_no_overlap_per_projector."

echo "==> [3/3] Testing concurrent pickup conversion (1 booking -> 1 loan)..."
run_pickup() {
  local out="$1"
  "$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -t -A >"$out" 2>"$out.err" <<SQL || true
BEGIN;
SELECT id FROM public.projectors WHERE id = '$P2_ID' FOR UPDATE;
SELECT id FROM public.bookings WHERE id = '$BPICK_ID' AND status = 'CONFIRMED' FOR UPDATE;
UPDATE public.bookings SET status = 'FULFILLED' WHERE id = '$BPICK_ID' AND status = 'CONFIRMED';
UPDATE public.projectors SET physical_status = 'BORROWED' WHERE id = '$P2_ID';
INSERT INTO public.loans (
  booking_id, projector_id, komting_id, status, picked_up_at,
  pickup_processed_by, pickup_received_by
)
SELECT '$BPICK_ID', '$P2_ID', '$U1_ID', 'ACTIVE', NOW(), '$STAFF_ID', 'KOMTING'
WHERE EXISTS (SELECT 1 FROM public.bookings WHERE id = '$BPICK_ID' AND status = 'FULFILLED')
RETURNING id;
COMMIT;
SQL
}

run_pickup "$TMP_DIR/pick1.out" &
PID1=$!
run_pickup "$TMP_DIR/pick2.out" &
PID2=$!
wait "$PID1" "$PID2"

LOAN_COUNT="$("$PSQL_BIN" "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM public.loans WHERE booking_id = '$BPICK_ID';")"
if [[ "$LOAN_COUNT" -ne 1 ]]; then
  echo "ERROR: Expected exactly 1 loan from concurrent pickup, got $LOAN_COUNT" >&2
  exit 1
fi
echo "    PASS: Concurrent pickup produced exactly 1 loan row."
