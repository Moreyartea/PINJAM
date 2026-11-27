-- ============================================================================
-- Migration 013: Atomic BE-3 Operating Hours & Projector Deactivation RPCs
-- ============================================================================
-- Purpose:
--   Provides PostgreSQL transactional RPC functions for Sprint BE-3 so:
--     1. Admin operating hours updates acquire a per-date advisory lock and
--        atomically check CONFIRMED bookings without silently cancelling them.
--     2. Admin projector deactivation locks the projector row, validates active
--        transactions (loans, maintenance, confirmed bookings), updates status
--        to INACTIVE, and writes an immutable audit log in one transaction.
--
-- Security Notes:
--   - All functions use SECURITY DEFINER with SET search_path = ''.
--   - EXECUTE is revoked from PUBLIC, anon, and authenticated, and granted
--     exclusively to service_role (backend API server).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Atomic Upsert Operating Hours with Booking Conflict Detection
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_operating_hours(
  p_service_date DATE,
  p_opens_at TIME WITHOUT TIME ZONE,
  p_closes_at TIME WITHOUT TIME ZONE,
  p_admin_early_open_at TIME WITHOUT TIME ZONE DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.operating_hours%ROWTYPE;
  v_has_existing BOOLEAN := FALSE;
  v_saved public.operating_hours%ROWTYPE;
  v_clean_note TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '');
  v_conflicts JSONB;
BEGIN
  IF p_service_date IS NULL OR p_opens_at IS NULL OR p_closes_at IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_OPERATING_WINDOW' USING ERRCODE = 'P0001';
  END IF;

  IF p_closes_at <= p_opens_at THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_OPERATING_WINDOW' USING ERRCODE = 'P0001';
  END IF;

  IF p_admin_early_open_at IS NOT NULL AND p_admin_early_open_at > p_opens_at THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_EARLY_OPEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize concurrent operating-hours mutations and booking checks per service_date.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('operating_hours:' || p_service_date::text)
  );

  SELECT * INTO v_existing
  FROM public.operating_hours oh
  WHERE oh.service_date = p_service_date
  FOR UPDATE;
  v_has_existing := FOUND;

  -- Detect any CONFIRMED bookings on service_date falling outside [p_opens_at, p_closes_at].
  WITH locked_bookings AS (
    SELECT
      b.id,
      b.booking_code,
      b.projector_id,
      b.start_time,
      b.start_at,
      b.estimated_return_at
    FROM public.bookings b
    WHERE b.booking_date = p_service_date
      AND b.status = 'CONFIRMED'
    FOR SHARE
  )
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'booking_id', lb.id,
      'booking_code', lb.booking_code,
      'projector_id', lb.projector_id,
      'start_time', lb.start_time::text,
      'estimated_return_at', lb.estimated_return_at
    )
    ORDER BY lb.start_at ASC
  )
  INTO v_conflicts
  FROM locked_bookings lb
  WHERE (lb.start_at AT TIME ZONE 'Asia/Jakarta')::time < p_opens_at
     OR (lb.estimated_return_at AT TIME ZONE 'Asia/Jakarta')::date <> p_service_date
     OR (lb.estimated_return_at AT TIME ZONE 'Asia/Jakarta')::time > p_closes_at;

  IF v_conflicts IS NOT NULL AND pg_catalog.jsonb_array_length(v_conflicts) > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'conflict', TRUE,
      'conflicting_bookings', v_conflicts
    );
  END IF;

  IF v_has_existing THEN
    UPDATE public.operating_hours
    SET opens_at = p_opens_at,
        closes_at = p_closes_at,
        admin_early_open_at = p_admin_early_open_at,
        note = v_clean_note,
        updated_by = p_admin_user_id
    WHERE id = v_existing.id
    RETURNING * INTO v_saved;
  ELSE
    INSERT INTO public.operating_hours (
      service_date,
      timezone,
      opens_at,
      closes_at,
      admin_early_open_at,
      note,
      created_by,
      updated_by
    ) VALUES (
      p_service_date,
      'Asia/Jakarta',
      p_opens_at,
      p_closes_at,
      p_admin_early_open_at,
      v_clean_note,
      p_admin_user_id,
      p_admin_user_id
    )
    RETURNING * INTO v_saved;
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
    'OPERATING_HOURS_UPDATED',
    'OPERATING_HOURS',
    v_saved.id::text,
    CASE
      WHEN v_has_existing THEN pg_catalog.jsonb_build_object(
        'service_date', v_existing.service_date::text,
        'opens_at', v_existing.opens_at::text,
        'closes_at', v_existing.closes_at::text,
        'admin_early_open_at', CASE
          WHEN v_existing.admin_early_open_at IS NULL THEN NULL
          ELSE v_existing.admin_early_open_at::text
        END,
        'note', v_existing.note
      )
      ELSE NULL
    END,
    pg_catalog.jsonb_build_object(
      'service_date', v_saved.service_date::text,
      'opens_at', v_saved.opens_at::text,
      'closes_at', v_saved.closes_at::text,
      'admin_early_open_at', CASE
        WHEN v_saved.admin_early_open_at IS NULL THEN NULL
        ELSE v_saved.admin_early_open_at::text
      END,
      'note', v_saved.note
    ),
    v_clean_note,
    p_request_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'conflict', FALSE,
    'operating_hours', pg_catalog.jsonb_build_object(
      'id', v_saved.id,
      'service_date', v_saved.service_date::text,
      'timezone', v_saved.timezone,
      'opens_at', v_saved.opens_at::text,
      'closes_at', v_saved.closes_at::text,
      'admin_early_open_at', CASE
        WHEN v_saved.admin_early_open_at IS NULL THEN NULL
        ELSE v_saved.admin_early_open_at::text
      END,
      'note', v_saved.note
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Atomic Projector Deactivation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_deactivate_projector(
  p_projector_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proj public.projectors%ROWTYPE;
  v_updated public.projectors%ROWTYPE;
  v_has_active_loan BOOLEAN := FALSE;
  v_has_active_maint BOOLEAN := FALSE;
  v_has_confirmed_booking BOOLEAN := FALSE;
  v_clean_reason TEXT := COALESCE(
    NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), ''),
    'Dinonaktifkan oleh ADMIN.'
  );
BEGIN
  SELECT * INTO v_proj
  FROM public.projectors p
  WHERE p.id = p_projector_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_proj.is_active OR v_proj.physical_status = 'INACTIVE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_ALREADY_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.loans l
    WHERE l.projector_id = p_projector_id AND l.status = 'ACTIVE'
  ) INTO v_has_active_loan;

  IF v_has_active_loan OR v_proj.physical_status = 'BORROWED' THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_HAS_ACTIVE_LOAN' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_records m
    WHERE m.projector_id = p_projector_id AND m.status = 'IN_PROGRESS'
  ) INTO v_has_active_maint;

  IF v_has_active_maint OR v_proj.physical_status = 'MAINTENANCE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_HAS_ACTIVE_MAINTENANCE' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.projector_id = p_projector_id AND b.status = 'CONFIRMED'
  ) INTO v_has_confirmed_booking;

  IF v_has_confirmed_booking THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_HAS_CONFIRMED_BOOKINGS' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.projectors
  SET is_active = FALSE,
      physical_status = 'INACTIVE'
  WHERE id = v_proj.id
  RETURNING * INTO v_updated;

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
    'PROJECTOR_DEACTIVATED',
    'PROJECTOR',
    v_updated.id::text,
    pg_catalog.jsonb_build_object(
      'physical_status', v_proj.physical_status,
      'is_active', v_proj.is_active
    ),
    pg_catalog.jsonb_build_object(
      'physical_status', v_updated.physical_status,
      'is_active', v_updated.is_active
    ),
    v_clean_reason,
    p_request_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_updated.id,
    'asset_code', v_updated.asset_code,
    'name', v_updated.name,
    'brand', v_updated.brand,
    'model', v_updated.model,
    'physical_status', v_updated.physical_status,
    'is_active', v_updated.is_active
  );
END;
$$;

-- Restrict RPC execution strictly to server-side service_role
REVOKE ALL ON FUNCTION public.rpc_admin_upsert_operating_hours(
  DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_admin_deactivate_projector(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rpc_admin_upsert_operating_hours(
      DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT, UUID, TEXT
    ) TO service_role;

    GRANT EXECUTE ON FUNCTION public.rpc_admin_deactivate_projector(UUID, UUID, TEXT, TEXT)
      TO service_role;
  END IF;
END $$;

COMMIT;
