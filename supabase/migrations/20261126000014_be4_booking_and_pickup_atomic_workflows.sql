-- ============================================================================
-- Migration 014: Atomic BE-4 Booking Creation, Cancellation & Pickup RPCs
-- ============================================================================
-- Purpose:
--   Provides PostgreSQL transactional RPC functions for Sprint BE-4 so:
--     1. Booking creation enforces active komting assignment, single active
--        booking/loan per komting, projector physical status, and exclusion
--        constraint concurrency protection in one atomic transaction.
--     2. Booking cancellation validates ownership, enforces CONFIRMED status,
--        revokes QR token, and logs audit and notification events.
--     3. Pickup confirmation atomically transitions booking to FULFILLED,
--        projector to BORROWED, creates ACTIVE loan, and binds QR token.
--
-- Security Notes:
--   - All functions use SECURITY DEFINER with SET search_path = ''.
--   - EXECUTE is revoked from PUBLIC, anon, and authenticated, and granted
--     exclusively to service_role (backend API server).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Atomic Booking Creation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_komting_create_booking(
  p_komting_user_id UUID,
  p_projector_id UUID,
  p_booking_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_estimated_return_at TIMESTAMPTZ,
  p_operating_hours_snapshot JSONB,
  p_pickup_window_start_at TIMESTAMPTZ,
  p_pickup_window_end_at TIMESTAMPTZ,
  p_qr_token_hash TEXT,
  p_qr_expires_at TIMESTAMPTZ,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_assignment public.komting_assignments%ROWTYPE;
  v_proj public.projectors%ROWTYPE;
  v_has_active_booking BOOLEAN := FALSE;
  v_has_active_loan BOOLEAN := FALSE;
  v_booking public.bookings%ROWTYPE;
  v_booking_code TEXT;
  v_today_jakarta DATE;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_retry_count INT := 0;
BEGIN
  IF p_komting_user_id IS NULL OR p_projector_id IS NULL OR p_booking_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Validate Komting User & Role
  SELECT * INTO v_user
  FROM public.users u
  WHERE u.id = p_komting_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_user.account_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:ACCOUNT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF v_user.role <> 'KOMTING' THEN
    RAISE EXCEPTION 'PINJAM_ERR:FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validate Active Komting Assignment
  SELECT * INTO v_assignment
  FROM public.komting_assignments ka
  WHERE ka.user_id = p_komting_user_id
    AND ka.status = 'ACTIVE'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:KOMTING_ASSIGNMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Check Single Active Booking Limit (CONFIRMED)
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.komting_id = p_komting_user_id
      AND b.status = 'CONFIRMED'
  ) INTO v_has_active_booking;

  IF v_has_active_booking THEN
    RAISE EXCEPTION 'PINJAM_ERR:ACTIVE_BOOKING_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Check Single Active Loan Limit (ACTIVE)
  SELECT EXISTS (
    SELECT 1 FROM public.loans l
    WHERE l.komting_id = p_komting_user_id
      AND l.status = 'ACTIVE'
  ) INTO v_has_active_loan;

  IF v_has_active_loan THEN
    RAISE EXCEPTION 'PINJAM_ERR:ACTIVE_LOAN_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Lock and Validate Projector Status
  SELECT * INTO v_proj
  FROM public.projectors p
  WHERE p.id = p_projector_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_proj.is_active THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_BOOKABLE' USING ERRCODE = 'P0001';
  END IF;

  v_today_jakarta := (v_now AT TIME ZONE 'Asia/Jakarta')::date;

  IF p_booking_date = v_today_jakarta THEN
    IF v_proj.physical_status <> 'AVAILABLE' THEN
      RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_BOOKABLE' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_proj.physical_status IN ('MAINTENANCE', 'INACTIVE') THEN
      RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_BOOKABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. Generate unique booking code
  LOOP
    v_booking_code := 'BKG-' || to_char(p_booking_date, 'YYYYMMDD') || '-' ||
                      upper(substring(gen_random_uuid()::text, 1, 4));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.booking_code = v_booking_code);
    v_retry_count := v_retry_count + 1;
    IF v_retry_count > 10 THEN
      RAISE EXCEPTION 'PINJAM_ERR:BOOKING_CODE_COLLISION' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- 7. Insert Booking (Trigger syncs start_at and validates calendar bounds)
  INSERT INTO public.bookings (
    booking_code,
    komting_id,
    projector_id,
    booking_date,
    start_time,
    start_at,
    estimated_return_at,
    status,
    operating_hours_snapshot,
    pickup_window_start_at,
    pickup_window_end_at
  ) VALUES (
    v_booking_code,
    p_komting_user_id,
    p_projector_id,
    p_booking_date,
    p_start_time,
    (p_booking_date + p_start_time) AT TIME ZONE 'Asia/Jakarta',
    p_estimated_return_at,
    'CONFIRMED',
    p_operating_hours_snapshot,
    p_pickup_window_start_at,
    p_pickup_window_end_at
  )
  RETURNING * INTO v_booking;

  -- 8. Create QR Token Record if token hash provided
  IF p_qr_token_hash IS NOT NULL AND btrim(p_qr_token_hash) <> '' THEN
    INSERT INTO public.qr_tokens (
      booking_id,
      token_hash,
      scope,
      expires_at
    ) VALUES (
      v_booking.id,
      p_qr_token_hash,
      'PICKUP_AND_RETURN',
      p_qr_expires_at
    );
  END IF;

  -- 9. Insert Audit Log
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    actor_source,
    action,
    entity_type,
    entity_id,
    after_data,
    request_id
  ) VALUES (
    p_komting_user_id,
    'KOMTING',
    'API',
    'BOOKING_CREATED',
    'BOOKING',
    v_booking.id::text,
    pg_catalog.jsonb_build_object(
      'booking_code', v_booking.booking_code,
      'projector_id', v_booking.projector_id,
      'booking_date', v_booking.booking_date::text,
      'start_time', v_booking.start_time::text,
      'estimated_return_at', v_booking.estimated_return_at,
      'status', v_booking.status
    ),
    p_request_id
  );

  -- 10. Queue Transactional Notification in Email Outbox
  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'BOOKING_CONFIRMED',
    v_user.email,
    pg_catalog.jsonb_build_object(
      'subject', 'Konfirmasi Booking Proyektor ' || v_booking.booking_code,
      'booking_id', v_booking.id,
      'booking_code', v_booking.booking_code,
      'projector_name', v_proj.name,
      'booking_date', v_booking.booking_date::text,
      'start_time', v_booking.start_time::text,
      'pickup_window_start_at', v_booking.pickup_window_start_at,
      'pickup_window_end_at', v_booking.pickup_window_end_at
    ),
    'booking_confirmed:' || v_booking.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_booking.id,
    'booking_code', v_booking.booking_code,
    'komting_id', v_booking.komting_id,
    'projector_id', v_booking.projector_id,
    'booking_date', v_booking.booking_date::text,
    'start_time', v_booking.start_time::text,
    'start_at', v_booking.start_at,
    'estimated_return_at', v_booking.estimated_return_at,
    'status', v_booking.status,
    'pickup_window', pg_catalog.jsonb_build_object(
      'opens_at', v_booking.pickup_window_start_at,
      'closes_at', v_booking.pickup_window_end_at
    ),
    'created_at', v_booking.created_at
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Atomic Booking Cancellation by Komting
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_komting_cancel_booking(
  p_booking_id UUID,
  p_komting_user_id UUID,
  p_reason TEXT,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_clean_reason TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF p_booking_id IS NULL OR p_komting_user_id IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user
  FROM public.users u
  WHERE u.id = p_komting_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.komting_id <> p_komting_user_id THEN
    RAISE EXCEPTION 'PINJAM_ERR:FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'PINJAM_ERR:BOOKING_CANNOT_BE_CANCELLED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bookings
  SET status = 'CANCELLED',
      cancelled_at = v_now,
      cancelled_by = p_komting_user_id,
      cancel_reason = COALESCE(v_clean_reason, 'Dibatalkan oleh Komting.')
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  -- Revoke any active QR tokens for this booking
  UPDATE public.qr_tokens
  SET revoked_at = v_now
  WHERE booking_id = v_booking.id
    AND revoked_at IS NULL;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    actor_source,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    reason,
    request_id
  ) VALUES (
    p_komting_user_id,
    'KOMTING',
    'API',
    'BOOKING_CANCELLED',
    'BOOKING',
    v_booking.id::text,
    pg_catalog.jsonb_build_object('status', 'CONFIRMED'),
    pg_catalog.jsonb_build_object('status', 'CANCELLED', 'cancelled_at', v_now),
    v_clean_reason,
    p_request_id
  );

  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'BOOKING_CANCELLED',
    v_user.email,
    pg_catalog.jsonb_build_object(
      'subject', 'Pembatalan Booking ' || v_booking.booking_code,
      'booking_id', v_booking.id,
      'booking_code', v_booking.booking_code,
      'reason', v_clean_reason
    ),
    'booking_cancelled:' || v_booking.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_booking.id,
    'booking_code', v_booking.booking_code,
    'status', v_booking.status,
    'cancelled_at', v_booking.cancelled_at,
    'cancel_reason', v_booking.cancel_reason
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Atomic Pickup Confirmation by Staff
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_staff_confirm_pickup(
  p_booking_id UUID,
  p_staff_user_id UUID,
  p_qr_payload_hash TEXT,
  p_received_by TEXT,
  p_representative_name TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff public.users%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_proj public.projectors%ROWTYPE;
  v_qr public.qr_tokens%ROWTYPE;
  v_loan public.loans%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_clean_rep_name TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_representative_name, '')), '');
BEGIN
  IF p_booking_id IS NULL OR p_staff_user_id IS NULL OR p_received_by IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  IF p_received_by NOT IN ('KOMTING', 'REPRESENTATIVE') THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  IF p_received_by = 'REPRESENTATIVE' AND v_clean_rep_name IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:REPRESENTATIVE_NAME_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Validate Staff
  SELECT * INTO v_staff
  FROM public.users u
  WHERE u.id = p_staff_user_id;

  IF NOT FOUND OR v_staff.role NOT IN ('STAFF', 'ADMIN') OR v_staff.account_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Lock Booking
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'PINJAM_ERR:BOOKING_NOT_CONFIRMED' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Check Pickup Window Tolerance (now must be between pickup_window_start_at and pickup_window_end_at)
  IF v_now < v_booking.pickup_window_start_at THEN
    RAISE EXCEPTION 'PINJAM_ERR:PICKUP_WINDOW_NOT_OPEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_now > v_booking.pickup_window_end_at THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock and Validate Projector
  SELECT * INTO v_proj
  FROM public.projectors p
  WHERE p.id = v_booking.projector_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_proj.physical_status <> 'AVAILABLE' OR NOT v_proj.is_active THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_AVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validate QR Token
  SELECT * INTO v_qr
  FROM public.qr_tokens qt
  WHERE qt.booking_id = v_booking.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_qr_payload_hash IS NOT NULL AND v_qr.token_hash <> p_qr_payload_hash THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_qr.revoked_at IS NOT NULL OR v_now > v_qr.expires_at THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_qr.pickup_used_at IS NOT NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_ALREADY_USED' USING ERRCODE = 'P0001';
  END IF;

  -- 6. Transition Booking to FULFILLED
  UPDATE public.bookings
  SET status = 'FULFILLED'
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  -- 7. Transition Projector to BORROWED
  UPDATE public.projectors
  SET physical_status = 'BORROWED'
  WHERE id = v_proj.id
  RETURNING * INTO v_proj;

  -- 8. Create ACTIVE Loan
  INSERT INTO public.loans (
    booking_id,
    projector_id,
    komting_id,
    status,
    picked_up_at,
    pickup_processed_by,
    pickup_received_by,
    representative_name
  ) VALUES (
    v_booking.id,
    v_proj.id,
    v_booking.komting_id,
    'ACTIVE',
    v_now,
    p_staff_user_id,
    p_received_by,
    v_clean_rep_name
  )
  RETURNING * INTO v_loan;

  -- 9. Update QR Token with pickup timestamp and loan binding
  UPDATE public.qr_tokens
  SET pickup_used_at = v_now,
      loan_id = v_loan.id
  WHERE id = v_qr.id;

  -- 10. Write Audit Log
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    actor_source,
    action,
    entity_type,
    entity_id,
    after_data,
    request_id
  ) VALUES (
    p_staff_user_id,
    v_staff.role,
    'API',
    'PICKUP_CONFIRMED',
    'LOAN',
    v_loan.id::text,
    pg_catalog.jsonb_build_object(
      'booking_id', v_booking.id,
      'loan_id', v_loan.id,
      'projector_id', v_proj.id,
      'received_by', p_received_by,
      'representative_name', v_clean_rep_name,
      'picked_up_at', v_now
    ),
    p_request_id
  );

  -- 11. Queue Loan Started Notification
  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'LOAN_STARTED',
    (SELECT email FROM public.users WHERE id = v_booking.komting_id),
    pg_catalog.jsonb_build_object(
      'subject', 'Peminjaman Proyektor Aktif — ' || v_booking.booking_code,
      'loan_id', v_loan.id,
      'booking_code', v_booking.booking_code,
      'projector_name', v_proj.name,
      'picked_up_at', v_now
    ),
    'loan_started:' || v_loan.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'booking', pg_catalog.jsonb_build_object(
      'id', v_booking.id,
      'status', v_booking.status
    ),
    'loan', pg_catalog.jsonb_build_object(
      'id', v_loan.id,
      'status', v_loan.status,
      'picked_up_at', v_loan.picked_up_at
    ),
    'projector', pg_catalog.jsonb_build_object(
      'id', v_proj.id,
      'physical_status', v_proj.physical_status
    )
  );
END;
$$;

-- Restrict RPC execution strictly to server-side service_role
REVOKE ALL ON FUNCTION public.rpc_komting_create_booking(
  UUID, UUID, DATE, TIME WITHOUT TIME ZONE, TIMESTAMPTZ, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_komting_cancel_booking(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_staff_confirm_pickup(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rpc_komting_create_booking(
      UUID, UUID, DATE, TIME WITHOUT TIME ZONE, TIMESTAMPTZ, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT
    ) TO service_role;

    GRANT EXECUTE ON FUNCTION public.rpc_komting_cancel_booking(UUID, UUID, TEXT, TEXT)
      TO service_role;

    GRANT EXECUTE ON FUNCTION public.rpc_staff_confirm_pickup(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
      TO service_role;
  END IF;
END $$;

COMMIT;
