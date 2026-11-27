-- ============================================================================
-- Migration 010: Final SQL Trigger, QR Clock & Causal Ordering Fixes
-- ============================================================================
-- Purpose:
--   Resolves remaining technical edge cases on top of migrations 001..009
--   without modifying historical migrations:
--     1. Fixes projector DELETE detection in verify_projector_status_consistency()
--        by capturing FOUND immediately after SELECT INTO v_projector before
--        subsequent SELECT EXISTS queries overwrite FOUND.
--     2. Replaces pg_catalog.now() (transaction start time) with
--        pg_catalog.clock_timestamp() (actual wall-clock time at statement
--        execution) in guard_qr_token_insert() and guard_qr_token_lifecycle().
--     3. Adds a strictly monotonic causal sequence (projector_lifecycle_seq /
--        lifecycle_seq) on loans, return_inspections, and maintenance_records
--        so verify_inspection_against_loan() accurately determines whether a
--        COMPLETED maintenance occurred after an inspection even when both
--        operations share the same transaction NOW() timestamp.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Monotonic Causal Ordering Sequence for Projector Lifecycle Events
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.projector_lifecycle_seq;

REVOKE ALL ON SEQUENCE public.projector_lifecycle_seq FROM PUBLIC, anon, authenticated;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS lifecycle_seq BIGINT NOT NULL
  DEFAULT pg_catalog.nextval('public.projector_lifecycle_seq');

ALTER TABLE public.return_inspections
  ADD COLUMN IF NOT EXISTS lifecycle_seq BIGINT NOT NULL
  DEFAULT pg_catalog.nextval('public.projector_lifecycle_seq');

ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS lifecycle_seq BIGINT NOT NULL
  DEFAULT pg_catalog.nextval('public.projector_lifecycle_seq');

CREATE OR REPLACE FUNCTION public.bump_projector_lifecycle_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.lifecycle_seq := pg_catalog.nextval('public.projector_lifecycle_seq');
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_loans_bump_lifecycle_seq'
  ) THEN
    CREATE TRIGGER trg_loans_bump_lifecycle_seq
      BEFORE INSERT OR UPDATE ON public.loans
      FOR EACH ROW
      EXECUTE FUNCTION public.bump_projector_lifecycle_seq();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_inspections_bump_lifecycle_seq'
  ) THEN
    CREATE TRIGGER trg_return_inspections_bump_lifecycle_seq
      BEFORE INSERT OR UPDATE ON public.return_inspections
      FOR EACH ROW
      EXECUTE FUNCTION public.bump_projector_lifecycle_seq();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_maintenance_records_bump_lifecycle_seq'
  ) THEN
    CREATE TRIGGER trg_maintenance_records_bump_lifecycle_seq
      BEFORE INSERT OR UPDATE ON public.maintenance_records
      FOR EACH ROW
      EXECUTE FUNCTION public.bump_projector_lifecycle_seq();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Fix Projector DELETE Detection in verify_projector_status_consistency()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_projector_status_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_projector public.projectors%ROWTYPE;
  v_projector_exists BOOLEAN;
  v_target_id UUID;
  v_has_active_loan BOOLEAN;
  v_has_active_maintenance BOOLEAN;
BEGIN
  v_target_id := COALESCE(NEW.id, OLD.id);

  SELECT * INTO v_projector
  FROM public.projectors p
  WHERE p.id = v_target_id;

  -- Capture FOUND immediately before subsequent SELECT EXISTS queries overwrite it.
  v_projector_exists := FOUND;

  SELECT EXISTS (
    SELECT 1 FROM public.loans l WHERE l.projector_id = v_target_id AND l.status = 'ACTIVE'
  ) INTO v_has_active_loan;

  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_records m
    WHERE m.projector_id = v_target_id AND m.status = 'IN_PROGRESS'
  ) INTO v_has_active_maintenance;

  IF NOT v_projector_exists THEN
    IF v_has_active_loan OR v_has_active_maintenance THEN
      RAISE EXCEPTION 'Projector % cannot be deleted with active loan or maintenance', v_target_id
        USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  IF v_projector.physical_status = 'BORROWED' AND NOT v_has_active_loan THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status BORROWED without an ACTIVE loan',
      v_projector.id
      USING ERRCODE = '23514';
  END IF;

  IF v_projector.physical_status <> 'BORROWED' AND v_has_active_loan THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status % while an ACTIVE loan exists',
      v_projector.id, v_projector.physical_status
      USING ERRCODE = '23514';
  END IF;

  IF v_projector.physical_status <> 'MAINTENANCE' AND v_has_active_maintenance THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status % while maintenance is IN_PROGRESS',
      v_projector.id, v_projector.physical_status
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Update verify_inspection_against_loan() with Causal Sequence Tie-Breaker
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_inspection_against_loan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inspection public.return_inspections%ROWTYPE;
  v_inspection_exists BOOLEAN;
  v_target_id UUID;
  v_loan_id UUID;
  v_loan_status TEXT;
  v_projector_id UUID;
  v_projector_status TEXT;
  v_projector_active BOOLEAN;
  v_has_newer_state BOOLEAN;
BEGIN
  v_target_id := COALESCE(NEW.id, OLD.id);

  SELECT * INTO v_inspection
  FROM public.return_inspections ri
  WHERE ri.id = v_target_id;

  v_inspection_exists := FOUND;

  IF NOT v_inspection_exists THEN
    v_loan_id := COALESCE(OLD.loan_id, NEW.loan_id);

    SELECT l.status INTO v_loan_status
    FROM public.loans l
    WHERE l.id = v_loan_id;

    IF v_loan_status = 'RETURNED' THEN
      RAISE EXCEPTION 'Cannot delete return_inspections % while loan % is RETURNED',
        v_target_id, v_loan_id
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  SELECT l.status, l.projector_id
  INTO v_loan_status, v_projector_id
  FROM public.loans l
  WHERE l.id = v_inspection.loan_id;

  IF v_loan_status IS DISTINCT FROM 'RETURNED' THEN
    RAISE EXCEPTION 'return_inspections for loan % requires loan status = RETURNED (actual: %)',
      v_inspection.loan_id, v_loan_status
      USING ERRCODE = '23514';
  END IF;

  SELECT p.physical_status, p.is_active
  INTO v_projector_status, v_projector_active
  FROM public.projectors p
  WHERE p.id = v_projector_id;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.loans l2
      WHERE l2.projector_id = v_projector_id
        AND l2.id <> v_inspection.loan_id
        AND (
          l2.status = 'ACTIVE'
          OR l2.picked_up_at > v_inspection.inspected_at
          OR (
            l2.picked_up_at = v_inspection.inspected_at
            AND l2.lifecycle_seq > v_inspection.lifecycle_seq
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.maintenance_records m
      WHERE m.projector_id = v_projector_id
        AND (
          m.status = 'IN_PROGRESS'
          OR m.started_at > v_inspection.inspected_at
          OR (
            m.started_at = v_inspection.inspected_at
            AND m.lifecycle_seq > v_inspection.lifecycle_seq
          )
        )
    )
  ) INTO v_has_newer_state;

  IF NOT v_has_newer_state AND v_projector_active THEN
    IF v_projector_status IS DISTINCT FROM v_inspection.unit_disposition THEN
      RAISE EXCEPTION
        'Projector % physical_status (%) must match return inspection unit_disposition (%)',
        v_projector_id, v_projector_status, v_inspection.unit_disposition
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Fix QR Expiry Validation Clock to Use pg_catalog.clock_timestamp()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_qr_token_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_clock TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF NEW.revoked_at IS NOT NULL AND (
    NEW.loan_id IS NOT NULL
    OR NEW.pickup_used_at IS NOT NULL
    OR NEW.return_used_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'revoked qr_token cannot be inserted with loan_id or consumed timestamps'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.pickup_used_at IS NOT NULL THEN
    IF NEW.pickup_used_at < NEW.created_at THEN
      RAISE EXCEPTION 'qr_tokens.pickup_used_at cannot precede created_at'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.pickup_used_at > NEW.expires_at OR v_clock > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be inserted with pickup_used_at past expires_at'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.return_used_at IS NOT NULL THEN
    IF NEW.return_used_at < NEW.created_at THEN
      RAISE EXCEPTION 'qr_tokens.return_used_at cannot precede created_at'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.return_used_at > NEW.expires_at OR v_clock > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be inserted with return_used_at past expires_at'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_qr_token_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_clock TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF OLD.booking_id IS DISTINCT FROM NEW.booking_id THEN
    RAISE EXCEPTION 'qr_tokens.booking_id is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.token_hash IS DISTINCT FROM NEW.token_hash THEN
    RAISE EXCEPTION 'qr_tokens.token_hash is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.scope IS DISTINCT FROM NEW.scope THEN
    RAISE EXCEPTION 'qr_tokens.scope is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'qr_tokens.created_at is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.return_used_at IS NOT NULL AND (
    NEW.return_used_at IS DISTINCT FROM OLD.return_used_at
    OR NEW.pickup_used_at IS DISTINCT FROM OLD.pickup_used_at
    OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
  ) THEN
    RAISE EXCEPTION 'completed qr_token cannot be modified'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.loan_id IS NOT NULL AND NEW.loan_id IS DISTINCT FROM OLD.loan_id THEN
    RAISE EXCEPTION 'qr_tokens.loan_id cannot be reassigned or cleared once linked'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'revoked qr_token cannot be reactivated or modified'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.pickup_used_at IS NOT NULL AND NEW.pickup_used_at IS DISTINCT FROM OLD.pickup_used_at THEN
    RAISE EXCEPTION 'qr_tokens.pickup_used_at cannot be modified or cleared (anti-replay)'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'cannot modify expires_at of a revoked qr_token'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.expires_at < v_clock THEN
      RAISE EXCEPTION 'cannot modify expires_at after qr_token has already expired'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.pickup_used_at IS NOT NULL AND NEW.expires_at < OLD.pickup_used_at THEN
      RAISE EXCEPTION 'cannot shorten qr_tokens.expires_at before pickup_used_at'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
    IF (OLD.pickup_used_at IS NULL AND NEW.pickup_used_at IS NOT NULL)
       OR (OLD.return_used_at IS NULL AND NEW.return_used_at IS NOT NULL)
       OR (OLD.loan_id IS NULL AND NEW.loan_id IS NOT NULL) THEN
      RAISE EXCEPTION 'revoked qr_token cannot be consumed or linked to a loan'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.pickup_used_at IS NULL AND NEW.pickup_used_at IS NOT NULL THEN
    IF NEW.pickup_used_at < OLD.created_at THEN
      RAISE EXCEPTION 'qr_tokens.pickup_used_at cannot precede created_at'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.pickup_used_at > NEW.expires_at OR v_clock > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be consumed for pickup'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.return_used_at IS NULL AND NEW.return_used_at IS NOT NULL THEN
    IF NEW.return_used_at < OLD.created_at THEN
      RAISE EXCEPTION 'qr_tokens.return_used_at cannot precede created_at'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.return_used_at > NEW.expires_at OR v_clock > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be consumed for return'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
