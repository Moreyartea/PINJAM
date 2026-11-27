-- ============================================================================
-- Migration 009: Deferred Trigger State-Lookup & QR Token Security Fix
-- ============================================================================
-- Purpose:
--   Fixes two critical database foundation issues without modifying historical
--   migrations 001..008:
--     1. Deferred constraint triggers now query the FINAL live row state by
--        primary key (instead of relying on stale NEW snapshots queued by
--        earlier statements within the same transaction), while still handling
--        INSERT, UPDATE, and DELETE cleanly without recursive writes.
--     2. QR token security hardening:
--        - Disallows inserting a revoked token already linked to a loan_id.
--        - Validates consumption against actual database time (pg_catalog.now())
--          in addition to the timestamp column, blocking backdated bypasses.
--        - Disallows consuming tokens with timestamps earlier than created_at.
--        - Protects completed (return_used_at IS NOT NULL) tokens from edits.
--        - Defines clear, policy-neutral rules for expires_at changes (blocks
--          reviving expired/revoked tokens or shortening below pickup_used_at).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Deferred Constraint Triggers Reading Final Live Row State
-- ----------------------------------------------------------------------------

-- 1a. Bookings: check final live booking row (or absence on DELETE)
CREATE OR REPLACE FUNCTION public.verify_booking_status_against_loans()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_target_id UUID;
  v_loan_count INTEGER;
BEGIN
  v_target_id := COALESCE(NEW.id, OLD.id);

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = v_target_id;

  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' AND OLD.status = 'FULFILLED' THEN
      RAISE EXCEPTION 'FULFILLED booking % cannot be deleted', OLD.id
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (SELECT 1 FROM public.loans l WHERE l.booking_id = v_target_id) THEN
      RAISE EXCEPTION 'Booking % cannot be deleted while referenced by a loan', v_target_id
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_loan_count
  FROM public.loans l
  WHERE l.booking_id = v_booking.id;

  IF v_booking.status = 'FULFILLED' AND v_loan_count <> 1 THEN
    RAISE EXCEPTION 'FULFILLED booking % must have exactly one loan (found: %)',
      v_booking.id, v_loan_count
      USING ERRCODE = '23514';
  END IF;

  IF v_booking.status IN ('CONFIRMED', 'CANCELLED', 'EXPIRED') AND v_loan_count <> 0 THEN
    RAISE EXCEPTION 'Booking % with status % cannot have any loan (found: %)',
      v_booking.id, v_booking.status, v_loan_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- 1b. Loans: check final live loan row (or absence on DELETE)
CREATE OR REPLACE FUNCTION public.verify_loan_cross_table_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_target_id UUID;
  v_booking_id UUID;
  v_projector_id UUID;
  v_booking_status TEXT;
  v_projector_status TEXT;
  v_has_inspection BOOLEAN;
  v_has_other_active_loan BOOLEAN;
BEGIN
  v_target_id := COALESCE(NEW.id, OLD.id);

  SELECT * INTO v_loan
  FROM public.loans l
  WHERE l.id = v_target_id;

  IF NOT FOUND THEN
    v_booking_id := COALESCE(OLD.booking_id, NEW.booking_id);
    v_projector_id := COALESCE(OLD.projector_id, NEW.projector_id);

    SELECT b.status INTO v_booking_status
    FROM public.bookings b
    WHERE b.id = v_booking_id;

    IF v_booking_status = 'FULFILLED' THEN
      RAISE EXCEPTION 'Cannot delete loan % while booking % remains FULFILLED',
        v_target_id, v_booking_id
        USING ERRCODE = '23514';
    END IF;

    SELECT p.physical_status INTO v_projector_status
    FROM public.projectors p
    WHERE p.id = v_projector_id;

    SELECT EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.projector_id = v_projector_id AND l.status = 'ACTIVE'
    ) INTO v_has_other_active_loan;

    IF v_projector_status = 'BORROWED' AND NOT v_has_other_active_loan THEN
      RAISE EXCEPTION 'Cannot delete loan % while projector % remains BORROWED without an ACTIVE loan',
        v_target_id, v_projector_id
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (SELECT 1 FROM public.return_inspections ri WHERE ri.loan_id = v_target_id) THEN
      RAISE EXCEPTION 'Cannot delete loan % while return_inspections references it',
        v_target_id
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  SELECT b.status INTO v_booking_status
  FROM public.bookings b
  WHERE b.id = v_loan.booking_id;

  IF v_booking_status IS DISTINCT FROM 'FULFILLED' THEN
    RAISE EXCEPTION 'Loan % requires booking % to be FULFILLED (actual: %)',
      v_loan.id, v_loan.booking_id, v_booking_status
      USING ERRCODE = '23514';
  END IF;

  IF v_loan.status = 'ACTIVE' THEN
    SELECT p.physical_status INTO v_projector_status
    FROM public.projectors p
    WHERE p.id = v_loan.projector_id;

    IF v_projector_status IS DISTINCT FROM 'BORROWED' THEN
      RAISE EXCEPTION 'ACTIVE loan % requires projector % physical_status = BORROWED (actual: %)',
        v_loan.id, v_loan.projector_id, v_projector_status
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_loan.status = 'RETURNED' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.return_inspections ri WHERE ri.loan_id = v_loan.id
    ) INTO v_has_inspection;

    IF NOT v_has_inspection THEN
      RAISE EXCEPTION 'RETURNED loan % requires a corresponding return_inspections record',
        v_loan.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- 1c. Projectors: check final live projector row (or absence on DELETE)
CREATE OR REPLACE FUNCTION public.verify_projector_status_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_projector public.projectors%ROWTYPE;
  v_target_id UUID;
  v_has_active_loan BOOLEAN;
  v_has_active_maintenance BOOLEAN;
BEGIN
  v_target_id := COALESCE(NEW.id, OLD.id);

  SELECT * INTO v_projector
  FROM public.projectors p
  WHERE p.id = v_target_id;

  SELECT EXISTS (
    SELECT 1 FROM public.loans l WHERE l.projector_id = v_target_id AND l.status = 'ACTIVE'
  ) INTO v_has_active_loan;

  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_records m
    WHERE m.projector_id = v_target_id AND m.status = 'IN_PROGRESS'
  ) INTO v_has_active_maintenance;

  IF NOT FOUND THEN
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

-- 1d. Return Inspections: check final live inspection row (or absence on DELETE)
CREATE OR REPLACE FUNCTION public.verify_inspection_against_loan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inspection public.return_inspections%ROWTYPE;
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

  IF NOT FOUND THEN
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
        AND (l2.status = 'ACTIVE' OR l2.picked_up_at > v_inspection.inspected_at)
    )
    OR EXISTS (
      SELECT 1 FROM public.maintenance_records m
      WHERE m.projector_id = v_projector_id
        AND (m.status = 'IN_PROGRESS' OR m.started_at > v_inspection.inspected_at)
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

-- 1e. Maintenance Records: check final live maintenance row (or absence on DELETE)
CREATE OR REPLACE FUNCTION public.verify_maintenance_against_projector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_maint public.maintenance_records%ROWTYPE;
  v_target_id UUID;
  v_projector_status TEXT;
BEGIN
  v_target_id := COALESCE(NEW.id, OLD.id);

  SELECT * INTO v_maint
  FROM public.maintenance_records m
  WHERE m.id = v_target_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_maint.status = 'IN_PROGRESS' THEN
    SELECT p.physical_status INTO v_projector_status
    FROM public.projectors p
    WHERE p.id = v_maint.projector_id;

    IF v_projector_status IS DISTINCT FROM 'MAINTENANCE' THEN
      RAISE EXCEPTION 'IN_PROGRESS maintenance % requires projector % physical_status = MAINTENANCE (actual: %)',
        v_maint.id, v_maint.projector_id, v_projector_status
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.projector_id = v_maint.projector_id AND l.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'IN_PROGRESS maintenance % cannot coexist with ACTIVE loan on projector %',
        v_maint.id, v_maint.projector_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Ensure projector DELETE is also guarded by deferred trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_projectors_verify_status_consistency') THEN
    DROP TRIGGER trg_projectors_verify_status_consistency ON public.projectors;
  END IF;
  CREATE CONSTRAINT TRIGGER trg_projectors_verify_status_consistency
    AFTER INSERT OR UPDATE OF physical_status, is_active OR DELETE ON public.projectors
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verify_projector_status_consistency();
END $$;

-- ----------------------------------------------------------------------------
-- 2. QR Token Security Hardening (Insert, Clock Expiry, Full Lock, Expiry Edits)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_qr_token_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.now();
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
    IF NEW.pickup_used_at > NEW.expires_at OR v_now > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be inserted with pickup_used_at past expires_at'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.return_used_at IS NOT NULL THEN
    IF NEW.return_used_at < NEW.created_at THEN
      RAISE EXCEPTION 'qr_tokens.return_used_at cannot precede created_at'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.return_used_at > NEW.expires_at OR v_now > NEW.expires_at THEN
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
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  -- Core identity & configuration columns are immutable
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

  -- Completed token (return already stamped) is locked against any manipulation
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

  -- Rules for expires_at updates (blocks reviving expired or revoked tokens)
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'cannot modify expires_at of a revoked qr_token'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.expires_at < v_now THEN
      RAISE EXCEPTION 'cannot modify expires_at after qr_token has already expired'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.pickup_used_at IS NOT NULL AND NEW.expires_at < OLD.pickup_used_at THEN
      RAISE EXCEPTION 'cannot shorten qr_tokens.expires_at before pickup_used_at'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Revoked tokens cannot be consumed or newly linked to a loan
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
    IF (OLD.pickup_used_at IS NULL AND NEW.pickup_used_at IS NOT NULL)
       OR (OLD.return_used_at IS NULL AND NEW.return_used_at IS NOT NULL)
       OR (OLD.loan_id IS NULL AND NEW.loan_id IS NOT NULL) THEN
      RAISE EXCEPTION 'revoked qr_token cannot be consumed or linked to a loan'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Validate pickup consumption against both DB current clock and expires_at
  IF OLD.pickup_used_at IS NULL AND NEW.pickup_used_at IS NOT NULL THEN
    IF NEW.pickup_used_at < OLD.created_at THEN
      RAISE EXCEPTION 'qr_tokens.pickup_used_at cannot precede created_at'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.pickup_used_at > NEW.expires_at OR v_now > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be consumed for pickup'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Validate return consumption against both DB current clock and expires_at
  IF OLD.return_used_at IS NULL AND NEW.return_used_at IS NOT NULL THEN
    IF NEW.return_used_at < OLD.created_at THEN
      RAISE EXCEPTION 'qr_tokens.return_used_at cannot precede created_at'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.return_used_at > NEW.expires_at OR v_now > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be consumed for return'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
