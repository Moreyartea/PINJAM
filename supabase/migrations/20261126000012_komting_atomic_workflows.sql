-- ============================================================================
-- Migration 012: Atomic KOMTING Approval, Rejection, Replacement & Deactivation RPCs
-- ============================================================================
-- Purpose:
--   Provides PostgreSQL transactional RPC functions so multi-entity KOMTING
--   lifecycle mutations execute atomically with row-level locking (FOR UPDATE),
--   audit logging, and transactional email outbox events.
--
-- Security Notes:
--   - All functions use SECURITY DEFINER with SET search_path = ''.
--   - EXECUTE is revoked from PUBLIC, anon, and authenticated, and granted
--     exclusively to service_role (backend API server).
--   - Does not weaken any existing constraints, triggers, or RLS policies.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Approve Standard KOMTING Application (NEW)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_approve_komting_application(
  p_application_id UUID,
  p_admin_user_id UUID,
  p_admin_note TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app public.komting_applications%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_existing_class_assign UUID;
  v_existing_user_assign UUID;
  v_assignment public.komting_assignments%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_clean_note TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_admin_note, '')), '');
  v_class_name TEXT;
BEGIN
  SELECT * INTO v_app
  FROM public.komting_applications a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status NOT IN ('PENDING_VERIFICATION', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'PINJAM_ERR:APPLICATION_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user
  FROM public.users u
  WHERE u.id = v_app.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_user.role <> 'KOMTING' THEN
    RAISE EXCEPTION 'PINJAM_ERR:FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_user.account_status IN ('INACTIVE', 'REJECTED') THEN
    RAISE EXCEPTION 'PINJAM_ERR:ACCOUNT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  v_class_name := pg_catalog.btrim(v_app.class_name);

  SELECT ka.id INTO v_existing_class_assign
  FROM public.komting_assignments ka
  WHERE pg_catalog.lower(pg_catalog.btrim(ka.class_name)) = pg_catalog.lower(v_class_name)
    AND ka.status = 'ACTIVE'
  FOR UPDATE;

  IF v_existing_class_assign IS NOT NULL OR v_app.application_type = 'REPLACEMENT' THEN
    RAISE EXCEPTION 'PINJAM_ERR:CLASS_ALREADY_HAS_ACTIVE_KOMTING' USING ERRCODE = 'P0001';
  END IF;

  SELECT ka.id INTO v_existing_user_assign
  FROM public.komting_assignments ka
  WHERE ka.user_id = v_app.user_id
    AND ka.status = 'ACTIVE'
  FOR UPDATE;

  IF v_existing_user_assign IS NOT NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT' USING ERRCODE = 'P0001';
  END IF;

  IF v_user.account_status = 'PENDING_VERIFICATION' THEN
    UPDATE public.users
    SET account_status = 'ACTIVE'
    WHERE id = v_user.id;
  END IF;

  UPDATE public.komting_applications
  SET status = 'APPROVED',
      admin_note = v_clean_note,
      reviewed_by = p_admin_user_id,
      reviewed_at = v_now
  WHERE id = v_app.id;

  INSERT INTO public.komting_assignments (
    user_id,
    class_name,
    status,
    started_at,
    created_by
  ) VALUES (
    v_app.user_id,
    v_class_name,
    'ACTIVE',
    v_now,
    p_admin_user_id
  )
  RETURNING * INTO v_assignment;

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
    p_admin_user_id,
    'ADMIN',
    'API',
    'KOMTING_APPLICATION_APPROVED',
    'KOMTING_APPLICATION',
    v_app.id::text,
    pg_catalog.jsonb_build_object('status', v_app.status),
    pg_catalog.jsonb_build_object(
      'status', 'APPROVED',
      'assignment_id', v_assignment.id,
      'class_name', v_assignment.class_name
    ),
    v_clean_note,
    p_request_id
  );

  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'KOMTING_APPLICATION_APPROVED',
    v_user.email,
    pg_catalog.jsonb_build_object(
      'application_id', v_app.id,
      'assignment_id', v_assignment.id,
      'class_name', v_assignment.class_name
    ),
    'komting-app-approved:' || v_app.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'application_id', v_app.id,
    'status', 'APPROVED',
    'assignment', pg_catalog.jsonb_build_object(
      'id', v_assignment.id,
      'status', v_assignment.status,
      'class_name', v_assignment.class_name
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Reject KOMTING Application (does NOT affect existing active komting)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_reject_komting_application(
  p_application_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app public.komting_applications%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_clean_reason TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REASON' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_app
  FROM public.komting_applications a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status NOT IN ('PENDING_VERIFICATION', 'PENDING_REVIEW', 'PENDING_REPLACEMENT_NOTICE') THEN
    RAISE EXCEPTION 'PINJAM_ERR:APPLICATION_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user
  FROM public.users u
  WHERE u.id = v_app.user_id;

  UPDATE public.komting_applications
  SET status = 'REJECTED',
      rejection_reason = v_clean_reason,
      reviewed_by = p_admin_user_id,
      reviewed_at = v_now
  WHERE id = v_app.id
  RETURNING * INTO v_app;

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
    p_admin_user_id,
    'ADMIN',
    'API',
    'KOMTING_APPLICATION_REJECTED',
    'KOMTING_APPLICATION',
    v_app.id::text,
    pg_catalog.jsonb_build_object('status', 'PENDING_VERIFICATION'),
    pg_catalog.jsonb_build_object('status', 'REJECTED', 'rejection_reason', v_clean_reason),
    v_clean_reason,
    p_request_id
  );

  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'KOMTING_APPLICATION_REJECTED',
    v_user.email,
    pg_catalog.jsonb_build_object(
      'application_id', v_app.id,
      'class_name', v_app.class_name,
      'reason', v_clean_reason
    ),
    'komting-app-rejected:' || v_app.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'application_id', v_app.id,
    'full_name', v_user.full_name,
    'email', v_user.email,
    'student_id', v_app.student_id,
    'class_name', v_app.class_name,
    'application_type', v_app.application_type,
    'status', v_app.status,
    'submitted_at', v_app.submitted_at,
    'admin_note', v_app.admin_note,
    'rejection_reason', v_app.rejection_reason
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Approve Replacement Atomically (deactivate old + activate new + cancel unpicked bookings)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_approve_komting_replacement(
  p_application_id UUID,
  p_admin_user_id UUID,
  p_admin_note TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app public.komting_applications%ROWTYPE;
  v_new_user public.users%ROWTYPE;
  v_old_assign public.komting_assignments%ROWTYPE;
  v_old_user public.users%ROWTYPE;
  v_new_assign public.komting_assignments%ROWTYPE;
  v_existing_user_assign UUID;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_clean_note TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_admin_note, '')), '');
  v_class_name TEXT;
  v_cancelled_ids UUID[];
BEGIN
  SELECT * INTO v_app
  FROM public.komting_applications a
  WHERE a.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status NOT IN ('PENDING_VERIFICATION', 'PENDING_REVIEW', 'PENDING_REPLACEMENT_NOTICE') THEN
    RAISE EXCEPTION 'PINJAM_ERR:APPLICATION_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_new_user
  FROM public.users u
  WHERE u.id = v_app.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_new_user.role <> 'KOMTING' THEN
    RAISE EXCEPTION 'PINJAM_ERR:FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF v_new_user.account_status IN ('INACTIVE', 'REJECTED') THEN
    RAISE EXCEPTION 'PINJAM_ERR:ACCOUNT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT ka.id INTO v_existing_user_assign
  FROM public.komting_assignments ka
  WHERE ka.user_id = v_app.user_id
    AND ka.status = 'ACTIVE'
  FOR UPDATE;

  IF v_existing_user_assign IS NOT NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT' USING ERRCODE = 'P0001';
  END IF;

  v_class_name := pg_catalog.btrim(v_app.class_name);

  SELECT * INTO v_old_assign
  FROM public.komting_assignments ka
  WHERE pg_catalog.lower(pg_catalog.btrim(ka.class_name)) = pg_catalog.lower(v_class_name)
    AND ka.status = 'ACTIVE'
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_old_user
    FROM public.users u
    WHERE u.id = v_old_assign.user_id;

    UPDATE public.komting_assignments
    SET status = 'REPLACED',
        ended_at = v_now,
        ended_by = p_admin_user_id,
        end_reason = COALESCE(v_clean_note, 'Pergantian komting disetujui ADMIN.')
    WHERE id = v_old_assign.id;

    WITH cancelled AS (
      UPDATE public.bookings b
      SET status = 'CANCELLED',
          cancelled_at = v_now,
          cancelled_by = p_admin_user_id,
          cancel_reason = 'Penugasan komting diganti oleh ADMIN.'
      WHERE b.komting_id = v_old_assign.user_id
        AND b.status = 'CONFIRMED'
      RETURNING b.id
    )
    SELECT pg_catalog.array_agg(id) INTO v_cancelled_ids FROM cancelled;

    IF v_cancelled_ids IS NOT NULL THEN
      UPDATE public.qr_tokens qt
      SET revoked_at = v_now
      WHERE qt.booking_id = ANY(v_cancelled_ids)
        AND qt.revoked_at IS NULL;
    END IF;

    INSERT INTO public.email_outbox (
      event_type,
      recipient,
      payload,
      deduplication_key
    ) VALUES (
      'KOMTING_REPLACEMENT_NOTICE_OLD',
      v_old_user.email,
      pg_catalog.jsonb_build_object(
        'old_assignment_id', v_old_assign.id,
        'class_name', v_class_name,
        'cancelled_booking_count', COALESCE(pg_catalog.array_length(v_cancelled_ids, 1), 0)
      ),
      'komting-replaced-old:' || v_app.id::text || ':' || v_old_assign.id::text
    )
    ON CONFLICT (deduplication_key) DO NOTHING;
  END IF;

  IF v_new_user.account_status = 'PENDING_VERIFICATION' THEN
    UPDATE public.users
    SET account_status = 'ACTIVE'
    WHERE id = v_new_user.id;
  END IF;

  UPDATE public.komting_applications
  SET status = 'APPROVED',
      admin_note = v_clean_note,
      reviewed_by = p_admin_user_id,
      reviewed_at = v_now
  WHERE id = v_app.id;

  INSERT INTO public.komting_assignments (
    user_id,
    class_name,
    status,
    started_at,
    created_by
  ) VALUES (
    v_app.user_id,
    v_class_name,
    'ACTIVE',
    v_now,
    p_admin_user_id
  )
  RETURNING * INTO v_new_assign;

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
    p_admin_user_id,
    'ADMIN',
    'API',
    'KOMTING_REPLACEMENT_APPROVED',
    'KOMTING_APPLICATION',
    v_app.id::text,
    pg_catalog.jsonb_build_object(
      'application_status', v_app.status,
      'previous_assignment_id', v_old_assign.id,
      'previous_user_id', v_old_assign.user_id
    ),
    pg_catalog.jsonb_build_object(
      'application_status', 'APPROVED',
      'new_assignment_id', v_new_assign.id,
      'new_user_id', v_new_assign.user_id,
      'class_name', v_new_assign.class_name,
      'cancelled_booking_count', COALESCE(pg_catalog.array_length(v_cancelled_ids, 1), 0)
    ),
    v_clean_note,
    p_request_id
  );

  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'KOMTING_REPLACEMENT_COMPLETED',
    v_new_user.email,
    pg_catalog.jsonb_build_object(
      'application_id', v_app.id,
      'assignment_id', v_new_assign.id,
      'class_name', v_new_assign.class_name
    ),
    'komting-replacement-new:' || v_app.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'application_id', v_app.id,
    'status', 'APPROVED',
    'assignment', pg_catalog.jsonb_build_object(
      'id', v_new_assign.id,
      'status', v_new_assign.status,
      'class_name', v_new_assign.class_name
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Deactivate KOMTING Assignment (cancel unpicked bookings, keep ACTIVE loans)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_deactivate_komting_assignment(
  p_assignment_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assign public.komting_assignments%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_clean_reason TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  v_cancelled_ids UUID[];
BEGIN
  IF v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REASON' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_assign
  FROM public.komting_assignments ka
  WHERE ka.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:ASSIGNMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_assign.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:ASSIGNMENT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user
  FROM public.users u
  WHERE u.id = v_assign.user_id;

  UPDATE public.komting_assignments
  SET status = 'INACTIVE',
      ended_at = v_now,
      ended_by = p_admin_user_id,
      end_reason = v_clean_reason
  WHERE id = v_assign.id;

  -- Cancel unpicked CONFIRMED bookings only; ACTIVE loans remain open until normal return.
  WITH cancelled AS (
    UPDATE public.bookings b
    SET status = 'CANCELLED',
        cancelled_at = v_now,
        cancelled_by = p_admin_user_id,
        cancel_reason = 'Penugasan komting dinonaktifkan: ' || v_clean_reason
    WHERE b.komting_id = v_assign.user_id
      AND b.status = 'CONFIRMED'
    RETURNING b.id
  )
  SELECT pg_catalog.array_agg(id) INTO v_cancelled_ids FROM cancelled;

  IF v_cancelled_ids IS NOT NULL THEN
    UPDATE public.qr_tokens qt
    SET revoked_at = v_now
    WHERE qt.booking_id = ANY(v_cancelled_ids)
      AND qt.revoked_at IS NULL;
  END IF;

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
    p_admin_user_id,
    'ADMIN',
    'API',
    'KOMTING_ASSIGNMENT_DEACTIVATED',
    'KOMTING_ASSIGNMENT',
    v_assign.id::text,
    pg_catalog.jsonb_build_object('status', 'ACTIVE', 'class_name', v_assign.class_name),
    pg_catalog.jsonb_build_object(
      'status', 'INACTIVE',
      'ended_at', v_now,
      'cancelled_booking_count', COALESCE(pg_catalog.array_length(v_cancelled_ids, 1), 0)
    ),
    v_clean_reason,
    p_request_id
  );

  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'KOMTING_ASSIGNMENT_DEACTIVATED',
    v_user.email,
    pg_catalog.jsonb_build_object(
      'assignment_id', v_assign.id,
      'class_name', v_assign.class_name,
      'reason', v_clean_reason,
      'cancelled_booking_count', COALESCE(pg_catalog.array_length(v_cancelled_ids, 1), 0)
    ),
    'komting-assign-deactivated:' || v_assign.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'cancelled_bookings_count', COALESCE(pg_catalog.array_length(v_cancelled_ids, 1), 0)
  );
END;
$$;

-- Restrict RPC execution strictly to server-side service_role
REVOKE ALL ON FUNCTION public.rpc_admin_approve_komting_application(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_reject_komting_application(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_approve_komting_replacement(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_deactivate_komting_assignment(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rpc_admin_approve_komting_application(UUID, UUID, TEXT, TEXT)
      TO service_role;
    GRANT EXECUTE ON FUNCTION public.rpc_admin_reject_komting_application(UUID, UUID, TEXT, TEXT)
      TO service_role;
    GRANT EXECUTE ON FUNCTION public.rpc_admin_approve_komting_replacement(UUID, UUID, TEXT, TEXT)
      TO service_role;
    GRANT EXECUTE ON FUNCTION public.rpc_admin_deactivate_komting_assignment(UUID, UUID, TEXT, TEXT)
      TO service_role;
  END IF;
END $$;

COMMIT;
