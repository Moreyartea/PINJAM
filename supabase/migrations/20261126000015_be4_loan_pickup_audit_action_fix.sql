-- ============================================================================
-- Migration 015: Standardize Loan Pickup Audit Action to LOAN_PICKUP_CONFIRMED
-- ============================================================================
-- Purpose:
--   Aligns loan pickup audit action with the project-wide {ENTITY}_{EVENT}
--   naming standard (e.g. BOOKING_CREATED, BOOKING_CANCELLED, PROJECTOR_DEACTIVATED).
--   Replaces legacy 'PICKUP_CONFIRMED' with 'LOAN_PICKUP_CONFIRMED' in:
--     public.rpc_staff_confirm_pickup transactional RPC function.
--   Note: Historical audit_logs rows are strictly append-only and immutable.
--
-- Security Notes:
--   - Function uses SECURITY DEFINER with SET search_path = ''.
--   - EXECUTE revoked from PUBLIC, anon, authenticated, granted to service_role.
-- ============================================================================

BEGIN;

-- 1. Update RPC function to record standardized action LOAN_PICKUP_CONFIRMED
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

  -- 3. Check Pickup Window Tolerance
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

  -- 10. Write Audit Log with standardized action LOAN_PICKUP_CONFIRMED
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
    'LOAN_PICKUP_CONFIRMED',
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

  -- 11. Queue Loan Started Notification in Email Outbox
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

REVOKE ALL ON FUNCTION public.rpc_staff_confirm_pickup(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rpc_staff_confirm_pickup(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
      TO service_role;
  END IF;
END $$;

COMMIT;
