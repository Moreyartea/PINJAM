-- ============================================================================
-- Verification Script: PINJAM Database Foundation (Migrations 001..010)
-- ============================================================================
-- Purpose:
--   Non-destructive transactional test suite verifying:
--     1. Booking created CONFIRMED then transitioned to FULFILLED in one tx
--     2. Projector created AVAILABLE then transitioned to BORROWED in one tx
--     3. Loan created ACTIVE then transitioned to RETURNED in one tx
--     4. Inspection and projector updated together in one tx
--     5. Maintenance created IN_PROGRESS and completed COMPLETED in one tx
--        (with causal lifecycle_seq distinguishing same-tx maintenance after
--        inspection)
--     6. Expired QR token cannot be consumed even with backdated timestamp
--     7. Revoked QR token cannot be inserted with loan_id populated
--     8. Multi-transition invariants & constraint mode restoration
--        (SET CONSTRAINTS ALL IMMEDIATE -> SET CONSTRAINTS ALL DEFERRED)
--     9. RLS verified for KOMTING A, KOMTING B, STAFF (loans + maintenance), ADMIN
--    10. Negative tests verify exact MESSAGE_TEXT via GET STACKED DIAGNOSTICS
--        so unexpected exceptions never pass silently.
--
-- Usage:
--   Execute via psql against a LOCAL/TEST database after applying migrations
--   001..010. Wrapped in BEGIN; ... ROLLBACK; so no test data persists.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_table TEXT;
  v_expected_tables TEXT[] := ARRAY[
    'users',
    'komting_applications',
    'komting_assignments',
    'projectors',
    'operating_hours',
    'bookings',
    'loans',
    'return_inspections',
    'maintenance_records',
    'qr_tokens',
    'email_outbox',
    'audit_logs',
    'idempotency_records'
  ];
  v_rls_enabled BOOLEAN;
  v_err_msg TEXT;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::date;
  v_tomorrow DATE := ((NOW() AT TIME ZONE 'Asia/Jakarta')::date + 1);
  v_admin_id UUID;
  v_staff_id UUID;
  v_komting_a_id UUID;
  v_komting_b_id UUID;
  v_projector1_id UUID;
  v_projector2_id UUID;
  v_projector3_id UUID;
  v_projector4_id UUID;
  v_booking1_id UUID;
  v_booking2_id UUID;
  v_booking_cancel_id UUID;
  v_booking_tx_id UUID;
  v_loan1_id UUID;
  v_loan_tx_id UUID;
  v_insp_tx_id UUID;
  v_qr1_id UUID;
  v_qr_revoked_id UUID;
  v_qr_expired_id UUID;
  v_maint_id UUID;
  v_maint_tx_id UUID;
  v_audit_id UUID;
  v_idem_id UUID;
  v_count INTEGER;
  v_auth_a TEXT := '11111111-1111-4111-8111-111111111111';
  v_auth_b TEXT := '22222222-2222-4222-8222-222222222222';
  v_auth_staff TEXT := '33333333-3333-4333-8333-333333333333';
  v_auth_admin TEXT := '44444444-4444-4444-8444-444444444444';
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. Verify all 13 tables exist and have RLS enabled
  -- --------------------------------------------------------------------------
  FOREACH v_table IN ARRAY v_expected_tables LOOP
    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_table;

    IF v_rls_enabled IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Expected table public.% to exist with RLS enabled', v_table;
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- 2. Verify privilege hardening for anon and authenticated
  -- --------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    FOREACH v_table IN ARRAY v_expected_tables LOOP
      IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
         OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
         OR has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
         OR has_table_privilege('anon', 'public.' || v_table, 'DELETE')
         OR has_table_privilege('anon', 'public.' || v_table, 'TRUNCATE') THEN
        RAISE EXCEPTION 'Expected anon to have zero privileges on public.%', v_table;
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF has_table_privilege('authenticated', 'public.qr_tokens', 'SELECT')
       OR has_table_privilege('authenticated', 'public.email_outbox', 'SELECT')
       OR has_table_privilege('authenticated', 'public.idempotency_records', 'SELECT') THEN
      RAISE EXCEPTION 'Expected authenticated to have zero SELECT privilege on internal tables';
    END IF;

    FOREACH v_table IN ARRAY v_expected_tables LOOP
      IF has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
         OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
         OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
         OR has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE')
         OR has_table_privilege('authenticated', 'public.' || v_table, 'REFERENCES')
         OR has_table_privilege('authenticated', 'public.' || v_table, 'TRIGGER') THEN
        RAISE EXCEPTION 'Expected authenticated to have zero write/DDL privileges on public.%', v_table;
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT has_table_privilege('service_role', 'public.users', 'SELECT, INSERT, UPDATE, DELETE')
       OR NOT has_table_privilege('service_role', 'public.audit_logs', 'SELECT, INSERT')
       OR NOT has_sequence_privilege('service_role', 'public.projector_lifecycle_seq', 'USAGE') THEN
      RAISE EXCEPTION 'Expected service_role to have required table and sequence privileges';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- 3. Seed actors & projectors
  -- --------------------------------------------------------------------------
  INSERT INTO public.users (auth_provider_user_id, email, full_name, role, account_status)
  VALUES (v_auth_admin, 'verify-admin@example.test', 'Verify Admin', 'ADMIN', 'ACTIVE')
  RETURNING id INTO v_admin_id;

  INSERT INTO public.users (auth_provider_user_id, email, full_name, role, account_status)
  VALUES (v_auth_staff, 'verify-staff@example.test', 'Verify Staff', 'STAFF', 'ACTIVE')
  RETURNING id INTO v_staff_id;

  INSERT INTO public.users (auth_provider_user_id, email, full_name, role, account_status)
  VALUES (v_auth_a, 'verify-komting-a@example.test', 'Verify Komting A', 'KOMTING', 'ACTIVE')
  RETURNING id INTO v_komting_a_id;

  INSERT INTO public.users (auth_provider_user_id, email, full_name, role, account_status)
  VALUES (v_auth_b, 'verify-komting-b@example.test', 'Verify Komting B', 'KOMTING', 'ACTIVE')
  RETURNING id INTO v_komting_b_id;

  INSERT INTO public.projectors (asset_code, name, physical_status, is_active)
  VALUES ('PRJ-VERIFY-001', 'Verify Projector 1', 'AVAILABLE', TRUE)
  RETURNING id INTO v_projector1_id;

  INSERT INTO public.projectors (asset_code, name, physical_status, is_active)
  VALUES ('PRJ-VERIFY-002', 'Verify Projector 2', 'AVAILABLE', TRUE)
  RETURNING id INTO v_projector2_id;

  INSERT INTO public.projectors (asset_code, name, physical_status, is_active)
  VALUES ('PRJ-VERIFY-003', 'Verify Projector 3', 'AVAILABLE', TRUE)
  RETURNING id INTO v_projector3_id;

  -- --------------------------------------------------------------------------
  -- 4. Multi-step SAME-TRANSACTION lifecycle test (4a + 4b)
  --    Ensures deferred triggers evaluate final state & causal lifecycle_seq
  --    distinguishes maintenance completed after inspection in the same tx.
  -- --------------------------------------------------------------------------
  INSERT INTO public.projectors (asset_code, name, physical_status, is_active)
  VALUES ('PRJ-VERIFY-TX', 'Verify TX Projector', 'AVAILABLE', TRUE)
  RETURNING id INTO v_projector4_id;

  INSERT INTO public.bookings (
    booking_code, komting_id, projector_id, booking_date, start_time,
    estimated_return_at, status, operating_hours_snapshot,
    pickup_window_start_at, pickup_window_end_at
  ) VALUES (
    'BKG-VERIFY-TX', v_komting_a_id, v_projector4_id,
    v_today, TIME '09:00:00',
    ((v_today + TIME '11:00:00') AT TIME ZONE 'Asia/Jakarta'),
    'CONFIRMED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
    ((v_today + TIME '08:30:00') AT TIME ZONE 'Asia/Jakarta'),
    ((v_today + TIME '09:15:00') AT TIME ZONE 'Asia/Jakarta')
  ) RETURNING id INTO v_booking_tx_id;

  UPDATE public.bookings SET status = 'FULFILLED' WHERE id = v_booking_tx_id;
  UPDATE public.projectors SET physical_status = 'BORROWED' WHERE id = v_projector4_id;

  INSERT INTO public.loans (
    booking_id, projector_id, komting_id, status, picked_up_at,
    pickup_processed_by, pickup_received_by
  ) VALUES (
    v_booking_tx_id, v_projector4_id, v_komting_a_id, 'ACTIVE',
    NOW() - INTERVAL '10 minutes', v_staff_id, 'KOMTING'
  ) RETURNING id INTO v_loan_tx_id;

  UPDATE public.loans
  SET status = 'RETURNED',
      returned_at = NOW(),
      return_processed_by = v_staff_id,
      return_received_by = 'KOMTING'
  WHERE id = v_loan_tx_id;

  INSERT INTO public.return_inspections (
    loan_id, projector_condition, accessories_condition,
    evidence_photo_storage_key, unit_disposition, inspected_by, inspected_at
  ) VALUES (
    v_loan_tx_id, 'NORMAL', 'COMPLETE', NULL,
    'AVAILABLE', v_staff_id, NOW()
  ) RETURNING id INTO v_insp_tx_id;

  UPDATE public.return_inspections
  SET projector_condition = 'DAMAGED',
      evidence_photo_storage_key = 'evidence/tx-update.jpg',
      unit_disposition = 'MAINTENANCE'
  WHERE id = v_insp_tx_id;

  UPDATE public.projectors SET physical_status = 'MAINTENANCE' WHERE id = v_projector4_id;

  -- Maintenance IN_PROGRESS -> COMPLETED -> projector AVAILABLE in same tx
  INSERT INTO public.maintenance_records (projector_id, reason, status, created_by)
  VALUES (v_projector4_id, 'Immediate repair', 'IN_PROGRESS', v_staff_id)
  RETURNING id INTO v_maint_tx_id;

  UPDATE public.maintenance_records
  SET status = 'COMPLETED',
      resolution_note = 'Fixed in same tx',
      completed_by = v_staff_id,
      completed_at = NOW()
  WHERE id = v_maint_tx_id;

  UPDATE public.projectors SET physical_status = 'AVAILABLE' WHERE id = v_projector4_id;

  -- Evaluate deferred constraints, then IMMEDIATELY restore DEFERRED mode
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  -- --------------------------------------------------------------------------
  -- 5. Negative Invariant Checks (Exact Diagnostic Assertions)
  -- --------------------------------------------------------------------------

  -- 5a. Projector BORROWED without ACTIVE loan must fail
  BEGIN
    INSERT INTO public.projectors (asset_code, name, physical_status, is_active)
    VALUES ('PRJ-VERIFY-BORROWED-ORPHAN', 'Orphan Borrowed', 'BORROWED', TRUE);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected projector BORROWED without ACTIVE loan to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%cannot have physical_status BORROWED without an ACTIVE loan%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 5a: %', v_err_msg;
    END IF;
  END;

  -- 5b. Active komting assignment uniqueness per class
  INSERT INTO public.komting_assignments (user_id, class_name, status, created_by)
  VALUES (v_komting_a_id, 'IF-VERIFY-01', 'ACTIVE', v_admin_id);

  INSERT INTO public.komting_applications (
    user_id, student_id, class_name, identity_photo_storage_key, application_type, status, reviewed_by, reviewed_at
  ) VALUES (
    v_komting_a_id, '240001', 'IF-VERIFY-01', 'identity/verify-a.jpg', 'NEW', 'APPROVED', v_admin_id, NOW()
  );

  INSERT INTO public.komting_applications (
    user_id, student_id, class_name, identity_photo_storage_key, application_type, status
  ) VALUES (
    v_komting_b_id, '240002', 'IF-VERIFY-02', 'identity/verify-b.jpg', 'NEW', 'PENDING_REVIEW'
  );

  BEGIN
    INSERT INTO public.komting_assignments (user_id, class_name, status, created_by)
    VALUES (v_komting_b_id, 'if-verify-01 ', 'ACTIVE', v_admin_id);
    RAISE EXCEPTION 'Expected duplicate active class assignment to fail';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%uq_komting_assignments_active_class%' THEN
      RAISE EXCEPTION 'Unexpected unique_violation on 5b: %', v_err_msg;
    END IF;
  END;

  -- 5c. Overlapping CONFIRMED bookings on same projector must fail
  INSERT INTO public.bookings (
    booking_code, komting_id, projector_id, booking_date, start_time,
    estimated_return_at, status, operating_hours_snapshot,
    pickup_window_start_at, pickup_window_end_at
  ) VALUES (
    'BKG-VERIFY-001', v_komting_a_id, v_projector1_id,
    v_tomorrow, TIME '09:00:00',
    ((v_tomorrow + TIME '11:00:00') AT TIME ZONE 'Asia/Jakarta'),
    'CONFIRMED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
    ((v_tomorrow + TIME '08:30:00') AT TIME ZONE 'Asia/Jakarta'),
    ((v_tomorrow + TIME '09:15:00') AT TIME ZONE 'Asia/Jakarta')
  ) RETURNING id INTO v_booking1_id;

  BEGIN
    INSERT INTO public.bookings (
      booking_code, komting_id, projector_id, booking_date, start_time,
      estimated_return_at, status, operating_hours_snapshot,
      pickup_window_start_at, pickup_window_end_at
    ) VALUES (
      'BKG-VERIFY-002', v_komting_b_id, v_projector1_id,
      v_tomorrow, TIME '10:00:00',
      ((v_tomorrow + TIME '12:00:00') AT TIME ZONE 'Asia/Jakarta'),
      'CONFIRMED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
      ((v_tomorrow + TIME '09:30:00') AT TIME ZONE 'Asia/Jakarta'),
      ((v_tomorrow + TIME '10:15:00') AT TIME ZONE 'Asia/Jakarta')
    );
    RAISE EXCEPTION 'Expected overlapping CONFIRMED booking to fail';
  EXCEPTION WHEN exclusion_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%excl_bookings_no_overlap_per_projector%' THEN
      RAISE EXCEPTION 'Unexpected exclusion_violation on 5c: %', v_err_msg;
    END IF;
  END;

  -- 5d. Booking FULFILLED without loan must fail
  BEGIN
    INSERT INTO public.bookings (
      booking_code, komting_id, projector_id, booking_date, start_time,
      estimated_return_at, status, operating_hours_snapshot,
      pickup_window_start_at, pickup_window_end_at
    ) VALUES (
      'BKG-VERIFY-FULFILLED-NO-LOAN', v_komting_b_id, v_projector2_id,
      v_tomorrow, TIME '09:00:00',
      ((v_tomorrow + TIME '11:00:00') AT TIME ZONE 'Asia/Jakarta'),
      'CONFIRMED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
      ((v_tomorrow + TIME '08:30:00') AT TIME ZONE 'Asia/Jakarta'),
      ((v_tomorrow + TIME '09:15:00') AT TIME ZONE 'Asia/Jakarta')
    );
    UPDATE public.bookings SET status = 'FULFILLED' WHERE booking_code = 'BKG-VERIFY-FULFILLED-NO-LOAN';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected FULFILLED booking without loan to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%must have exactly one loan%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 5d: %', v_err_msg;
    END IF;
  END;

  -- Seed valid booking2 (CONFIRMED) and cancelled booking
  INSERT INTO public.bookings (
    booking_code, komting_id, projector_id, booking_date, start_time,
    estimated_return_at, status, operating_hours_snapshot,
    pickup_window_start_at, pickup_window_end_at
  ) VALUES (
    'BKG-VERIFY-003', v_komting_b_id, v_projector2_id,
    v_tomorrow, TIME '09:00:00',
    ((v_tomorrow + TIME '11:00:00') AT TIME ZONE 'Asia/Jakarta'),
    'CONFIRMED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
    ((v_tomorrow + TIME '08:30:00') AT TIME ZONE 'Asia/Jakarta'),
    ((v_tomorrow + TIME '09:15:00') AT TIME ZONE 'Asia/Jakarta')
  ) RETURNING id INTO v_booking2_id;

  INSERT INTO public.bookings (
    booking_code, komting_id, projector_id, booking_date, start_time,
    estimated_return_at, status, operating_hours_snapshot,
    pickup_window_start_at, pickup_window_end_at, cancelled_at, cancel_reason
  ) VALUES (
    'BKG-VERIFY-CANCEL', v_komting_b_id, v_projector3_id,
    v_tomorrow, TIME '13:00:00',
    ((v_tomorrow + TIME '15:00:00') AT TIME ZONE 'Asia/Jakarta'),
    'CANCELLED', '{"opens_at":"08:00:00","closes_at":"17:00:00"}'::jsonb,
    ((v_tomorrow + TIME '12:30:00') AT TIME ZONE 'Asia/Jakarta'),
    ((v_tomorrow + TIME '13:15:00') AT TIME ZONE 'Asia/Jakarta'),
    NOW(), 'Verify cancel'
  ) RETURNING id INTO v_booking_cancel_id;

  -- --------------------------------------------------------------------------
  -- 6. QR Token Security Tests (clock_timestamp expiry, revoked + loan_id, immutability)
  -- --------------------------------------------------------------------------
  INSERT INTO public.qr_tokens (booking_id, token_hash, scope, expires_at, created_at)
  VALUES (
    v_booking1_id, 'hash_verify_001', 'PICKUP_AND_RETURN',
    clock_timestamp() + INTERVAL '4 hours', clock_timestamp() - INTERVAL '1 hour'
  ) RETURNING id INTO v_qr1_id;

  INSERT INTO public.qr_tokens (booking_id, token_hash, scope, expires_at, revoked_at)
  VALUES (
    v_booking_cancel_id, 'hash_verify_revoked', 'PICKUP_AND_RETURN',
    clock_timestamp() + INTERVAL '4 hours', clock_timestamp()
  ) RETURNING id INTO v_qr_revoked_id;

  INSERT INTO public.qr_tokens (booking_id, token_hash, scope, expires_at, created_at)
  VALUES (
    v_booking2_id, 'hash_verify_expired', 'PICKUP_AND_RETURN',
    clock_timestamp() - INTERVAL '10 minutes', clock_timestamp() - INTERVAL '2 hours'
  ) RETURNING id INTO v_qr_expired_id;

  -- 6a. Revoked token cannot be reactivated
  BEGIN
    UPDATE public.qr_tokens SET revoked_at = NULL WHERE id = v_qr_revoked_id;
    RAISE EXCEPTION 'Expected reactivating revoked QR token to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%revoked qr_token cannot be reactivated%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 6a: %', v_err_msg;
    END IF;
  END;

  -- 6b. Revoked token cannot be inserted with loan_id populated
  BEGIN
    INSERT INTO public.qr_tokens (
      booking_id, loan_id, token_hash, scope, expires_at, revoked_at
    ) VALUES (
      v_booking_tx_id, v_loan_tx_id, 'hash_revoked_with_loan', 'PICKUP_AND_RETURN',
      clock_timestamp() + INTERVAL '1 hour', clock_timestamp()
    );
    RAISE EXCEPTION 'Expected inserting revoked QR token with loan_id to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%revoked qr_token cannot be inserted with loan_id%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 6b: %', v_err_msg;
    END IF;
  END;

  -- 6c. Expired token cannot be consumed even by sending a backdated pickup_used_at < expires_at
  BEGIN
    UPDATE public.qr_tokens
    SET pickup_used_at = clock_timestamp() - INTERVAL '30 minutes'
    WHERE id = v_qr_expired_id;
    RAISE EXCEPTION 'Expected consuming expired QR token with backdated timestamp to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%expired qr_token cannot be consumed for pickup%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 6c: %', v_err_msg;
    END IF;
  END;

  -- 6d. Already-expired token cannot be revived by extending expires_at
  BEGIN
    UPDATE public.qr_tokens
    SET expires_at = clock_timestamp() + INTERVAL '2 hours'
    WHERE id = v_qr_expired_id;
    RAISE EXCEPTION 'Expected extending expires_at on expired QR token to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%cannot modify expires_at after qr_token has already expired%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 6d: %', v_err_msg;
    END IF;
  END;

  -- 6e. token_hash is immutable
  BEGIN
    UPDATE public.qr_tokens SET token_hash = 'hash_tampered' WHERE id = v_qr1_id;
    RAISE EXCEPTION 'Expected modifying token_hash to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%token_hash is immutable%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 6e: %', v_err_msg;
    END IF;
  END;

  -- --------------------------------------------------------------------------
  -- 7. Pickup, Loan Delete Rejection, Inspection Mismatch, Return & Completed QR Lock
  -- --------------------------------------------------------------------------
  UPDATE public.bookings SET status = 'FULFILLED' WHERE id = v_booking1_id;
  UPDATE public.projectors SET physical_status = 'BORROWED' WHERE id = v_projector1_id;

  INSERT INTO public.loans (
    booking_id, projector_id, komting_id, status, picked_up_at,
    pickup_processed_by, pickup_received_by
  ) VALUES (
    v_booking1_id, v_projector1_id, v_komting_a_id, 'ACTIVE',
    clock_timestamp() - INTERVAL '20 minutes', v_staff_id, 'KOMTING'
  ) RETURNING id INTO v_loan1_id;

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  -- 7a. Duplicate loan on same booking fails
  BEGIN
    INSERT INTO public.loans (
      booking_id, projector_id, komting_id, status, picked_up_at,
      pickup_processed_by, pickup_received_by
    ) VALUES (
      v_booking1_id, v_projector1_id, v_komting_a_id, 'ACTIVE',
      clock_timestamp(), v_staff_id, 'KOMTING'
    );
    RAISE EXCEPTION 'Expected duplicate loan on same booking to fail';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%loans_booking_id_key%' THEN
      RAISE EXCEPTION 'Unexpected unique_violation on 7a: %', v_err_msg;
    END IF;
  END;

  -- 7b. Deleting loan while booking is FULFILLED fails
  BEGIN
    DELETE FROM public.loans WHERE id = v_loan1_id;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected deleting loan linked to FULFILLED booking to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%Cannot delete loan%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 7b: %', v_err_msg;
    END IF;
  END;

  -- Link QR1 & stamp pickup
  UPDATE public.qr_tokens
  SET loan_id = v_loan1_id,
      pickup_used_at = clock_timestamp() - INTERVAL '20 minutes'
  WHERE id = v_qr1_id;

  -- 7c. Mismatched inspection disposition vs projector physical_status must fail
  BEGIN
    UPDATE public.loans
    SET status = 'RETURNED',
        returned_at = clock_timestamp(),
        return_processed_by = v_staff_id,
        return_received_by = 'KOMTING'
    WHERE id = v_loan1_id;

    INSERT INTO public.return_inspections (
      loan_id, projector_condition, accessories_condition,
      evidence_photo_storage_key, unit_disposition, inspected_by, inspected_at
    ) VALUES (
      v_loan1_id, 'DAMAGED', 'COMPLETE', 'evidence/mismatch.jpg',
      'MAINTENANCE', v_staff_id, clock_timestamp()
    );

    UPDATE public.projectors SET physical_status = 'AVAILABLE' WHERE id = v_projector1_id;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected inspection MAINTENANCE vs projector AVAILABLE to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%must match return inspection unit_disposition%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 7c: %', v_err_msg;
    END IF;
  END;

  -- 7d. Valid atomic return (DAMAGED + AVAILABLE allowed when STAFF/ADMIN sets AVAILABLE)
  UPDATE public.loans
  SET status = 'RETURNED',
      returned_at = clock_timestamp(),
      return_processed_by = v_staff_id,
      return_received_by = 'KOMTING'
  WHERE id = v_loan1_id;

  INSERT INTO public.return_inspections (
    loan_id, projector_condition, accessories_condition,
    evidence_photo_storage_key, unit_disposition, inspected_by, inspected_at
  ) VALUES (
    v_loan1_id, 'DAMAGED', 'COMPLETE', 'evidence/minor-scratch.jpg',
    'AVAILABLE', v_staff_id, clock_timestamp()
  );

  UPDATE public.projectors SET physical_status = 'AVAILABLE' WHERE id = v_projector1_id;
  UPDATE public.qr_tokens SET return_used_at = clock_timestamp() WHERE id = v_qr1_id;

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  -- 7e. Completed QR token cannot be modified
  BEGIN
    UPDATE public.qr_tokens SET expires_at = clock_timestamp() + INTERVAL '8 hours' WHERE id = v_qr1_id;
    RAISE EXCEPTION 'Expected modifying completed QR token to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%completed qr_token cannot be modified%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 7e: %', v_err_msg;
    END IF;
  END;

  -- --------------------------------------------------------------------------
  -- 8. Maintenance Delete Protection & Mismatch Check
  -- --------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.maintenance_records (projector_id, reason, status, created_by)
    VALUES (v_projector3_id, 'Lamp check', 'IN_PROGRESS', v_staff_id);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected IN_PROGRESS maintenance on AVAILABLE projector to fail';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%requires projector%physical_status = MAINTENANCE%' THEN
      RAISE EXCEPTION 'Unexpected check_violation on 8a: %', v_err_msg;
    END IF;
  END;

  UPDATE public.projectors SET physical_status = 'MAINTENANCE' WHERE id = v_projector3_id;
  INSERT INTO public.maintenance_records (projector_id, reason, status, created_by)
  VALUES (v_projector3_id, 'Lamp check', 'IN_PROGRESS', v_staff_id)
  RETURNING id INTO v_maint_id;

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  BEGIN
    DELETE FROM public.maintenance_records WHERE id = v_maint_id;
    RAISE EXCEPTION 'Expected deleting maintenance_records history to fail';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%maintenance_records history cannot be deleted%' THEN
      RAISE EXCEPTION 'Unexpected insufficient_privilege on 8b: %', v_err_msg;
    END IF;
  END;

  -- --------------------------------------------------------------------------
  -- 9. Idempotency & Audit Log Immutability
  -- --------------------------------------------------------------------------
  INSERT INTO public.idempotency_records (
    idempotency_key, actor_user_id, route_or_operation, request_hash, status, expires_at
  ) VALUES (
    'idem-verify-001', v_komting_a_id, 'POST /api/v1/bookings', 'sha256_verify',
    'IN_PROGRESS', NOW() + INTERVAL '24 hours'
  ) RETURNING id INTO v_idem_id;

  UPDATE public.idempotency_records
  SET status = 'COMPLETED', response_status = 201, response_body = '{"data":{"id":"ok"}}'::jsonb
  WHERE id = v_idem_id;

  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, actor_source, action, entity_type, entity_id, request_id
  ) VALUES (
    v_admin_id, 'ADMIN', 'API', 'VERIFY_TEST', 'BOOKING', v_booking1_id::text, 'req_verify_001'
  ) RETURNING id INTO v_audit_id;

  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_audit_id;
    RAISE EXCEPTION 'Expected DELETE on audit_logs to fail';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    IF v_err_msg NOT LIKE '%audit_logs is append-only%' THEN
      RAISE EXCEPTION 'Unexpected insufficient_privilege on 9: %', v_err_msg;
    END IF;
  END;

  -- --------------------------------------------------------------------------
  -- 10. RLS Multi-Actor Verification (KOMTING A, KOMTING B, STAFF, ADMIN)
  -- --------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'auth' AND p.proname = 'uid'
     ) THEN
    SET LOCAL ROLE authenticated;

    -- KOMTING A
    PERFORM set_config('request.jwt.claim.sub', v_auth_a, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_a, 'role', 'authenticated')::text, true);

    SELECT count(*)::integer INTO v_count FROM public.bookings;
    IF v_count <> 2 THEN
      RAISE EXCEPTION 'RLS KOMTING A expected 2 own bookings, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.loans;
    IF v_count <> 2 THEN
      RAISE EXCEPTION 'RLS KOMTING A expected 2 own loans, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.maintenance_records;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS KOMTING A expected 0 maintenance_records, got %', v_count;
    END IF;

    -- KOMTING B
    PERFORM set_config('request.jwt.claim.sub', v_auth_b, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_b, 'role', 'authenticated')::text, true);

    SELECT count(*)::integer INTO v_count FROM public.bookings WHERE komting_id = v_komting_a_id;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS KOMTING B leaked KOMTING A bookings (% rows)', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.loans WHERE komting_id = v_komting_a_id;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS KOMTING B leaked KOMTING A loans (% rows)', v_count;
    END IF;

    -- STAFF: explicitly verify loans and maintenance_records visibility
    PERFORM set_config('request.jwt.claim.sub', v_auth_staff, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_staff, 'role', 'authenticated')::text, true);

    SELECT count(*)::integer INTO v_count FROM public.loans;
    IF v_count < 2 THEN
      RAISE EXCEPTION 'RLS STAFF expected operational loans visibility, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.maintenance_records;
    IF v_count < 2 THEN
      RAISE EXCEPTION 'RLS STAFF expected operational maintenance_records visibility, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.bookings;
    IF v_count < 3 THEN
      RAISE EXCEPTION 'RLS STAFF expected operational bookings visibility, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.return_inspections;
    IF v_count < 2 THEN
      RAISE EXCEPTION 'RLS STAFF expected return_inspections visibility, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.komting_applications;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS STAFF expected 0 komting_applications, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.audit_logs;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS STAFF expected 0 audit_logs, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.users WHERE role = 'ADMIN';
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS STAFF leaked ADMIN user profiles (% rows)', v_count;
    END IF;

    -- ADMIN
    PERFORM set_config('request.jwt.claim.sub', v_auth_admin, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_admin, 'role', 'authenticated')::text, true);

    SELECT count(*)::integer INTO v_count FROM public.komting_applications;
    IF v_count < 2 THEN
      RAISE EXCEPTION 'RLS ADMIN expected all komting_applications, got %', v_count;
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.audit_logs;
    IF v_count < 1 THEN
      RAISE EXCEPTION 'RLS ADMIN expected audit_logs visibility, got %', v_count;
    END IF;

    RESET ROLE;
  ELSE
    RAISE NOTICE 'RLS multi-actor test skipped: Supabase auth.uid() or authenticated role not present.';
  END IF;
END $$;

ROLLBACK;
