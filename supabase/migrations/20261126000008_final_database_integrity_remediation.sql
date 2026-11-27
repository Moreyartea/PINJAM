-- ============================================================================
-- Migration 008: Final Database Integrity Remediation
-- ============================================================================
-- Purpose:
--   Completes remaining relational, lifecycle, and cross-table integrity
--   safeguards on top of migrations 001..007 without modifying historical
--   migration files or deleting existing data.
--
-- Remediations Covered:
--   1. QR Token Lifecycle Hardening:
--      - Revoked tokens (revoked_at IS NOT NULL) cannot be reactivated or used.
--      - Immutable token_hash, scope, booking_id, and created_at.
--      - Expired tokens cannot be consumed (pickup_used_at / return_used_at
--        must not exceed expires_at); does not alter business expiry policy.
--   2. Booking <-> Loan Bidirectional Integrity:
--      - FULFILLED booking must have a loan (checked on INSERT, UPDATE, DELETE).
--      - CONFIRMED, CANCELLED, and EXPIRED bookings must have zero loans.
--      - Prevent FK reassignment or orphan deletions across bookings/loans.
--   3. Inspection <-> Projector & Loan Consistency:
--      - Inspections allowed only for RETURNED loans; loan_id immutable.
--      - Projector physical_status must match unit_disposition upon return.
--      - Projector physical_status = 'BORROWED' requires an ACTIVE loan.
--      - Does NOT force DAMAGED -> MAINTENANCE automatically (preserves
--        STAFF/ADMIN disposition authority per PRD §7.11).
--   4. Maintenance Integrity & History Protection:
--      - IN_PROGRESS maintenance requires projector physical_status = 'MAINTENANCE'.
--      - Protect maintenance_records against DELETE, projector_id reassignment,
--        and reopening COMPLETED records.
--   5. Complete Deferred Constraint Triggers (INSERT, UPDATE, DELETE) with
--      read-only check functions (no recursive writes or infinite trigger loops).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. QR Token Lifecycle Hardening (Immutability, Revocation, Expiry Guard)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_qr_token_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
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

  IF OLD.return_used_at IS NOT NULL AND NEW.return_used_at IS DISTINCT FROM OLD.return_used_at THEN
    RAISE EXCEPTION 'qr_tokens.return_used_at cannot be modified or cleared (anti-replay)'
      USING ERRCODE = '23514';
  END IF;

  IF (OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NOT NULL) THEN
    IF (OLD.pickup_used_at IS NULL AND NEW.pickup_used_at IS NOT NULL)
       OR (OLD.return_used_at IS NULL AND NEW.return_used_at IS NOT NULL)
       OR (OLD.loan_id IS NULL AND NEW.loan_id IS NOT NULL) THEN
      RAISE EXCEPTION 'revoked qr_token cannot be consumed or linked to a loan'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.pickup_used_at IS NULL AND NEW.pickup_used_at IS NOT NULL THEN
    IF NEW.pickup_used_at > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be consumed for pickup'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.return_used_at IS NULL AND NEW.return_used_at IS NOT NULL THEN
    IF NEW.return_used_at > NEW.expires_at THEN
      RAISE EXCEPTION 'expired qr_token cannot be consumed for return'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_qr_token_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL AND (NEW.pickup_used_at IS NOT NULL OR NEW.return_used_at IS NOT NULL) THEN
    RAISE EXCEPTION 'revoked qr_token cannot be inserted as consumed'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.pickup_used_at IS NOT NULL AND NEW.pickup_used_at > NEW.expires_at THEN
    RAISE EXCEPTION 'expired qr_token cannot be inserted with pickup_used_at past expires_at'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.return_used_at IS NOT NULL AND NEW.return_used_at > NEW.expires_at THEN
    RAISE EXCEPTION 'expired qr_token cannot be inserted with return_used_at past expires_at'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_qr_tokens_insert_guard'
  ) THEN
    CREATE TRIGGER trg_qr_tokens_insert_guard
      BEFORE INSERT ON public.qr_tokens
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_qr_token_insert();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Protect Immutable Foreign Keys & Historical Records
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_loan_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.booking_id IS DISTINCT FROM NEW.booking_id
     OR OLD.projector_id IS DISTINCT FROM NEW.projector_id
     OR OLD.komting_id IS DISTINCT FROM NEW.komting_id THEN
    RAISE EXCEPTION 'loans foreign keys (booking_id, projector_id, komting_id) are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'RETURNED' AND NEW.status <> 'RETURNED' THEN
    RAISE EXCEPTION 'RETURNED loan % cannot revert to %', OLD.id, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inspection_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.loan_id IS DISTINCT FROM NEW.loan_id THEN
    RAISE EXCEPTION 'return_inspections.loan_id is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_maintenance_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'maintenance_records history cannot be deleted (record %)', OLD.id
      USING ERRCODE = '42501';
  END IF;

  IF OLD.projector_id IS DISTINCT FROM NEW.projector_id THEN
    RAISE EXCEPTION 'maintenance_records.projector_id is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'COMPLETED' AND NEW.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'COMPLETED maintenance record % cannot revert to %', OLD.id, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_loans_immutability_guard'
  ) THEN
    CREATE TRIGGER trg_loans_immutability_guard
      BEFORE UPDATE ON public.loans
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_loan_immutability();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_inspections_immutability_guard'
  ) THEN
    CREATE TRIGGER trg_return_inspections_immutability_guard
      BEFORE UPDATE ON public.return_inspections
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_inspection_immutability();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_maintenance_records_history_guard'
  ) THEN
    CREATE TRIGGER trg_maintenance_records_history_guard
      BEFORE UPDATE OR DELETE ON public.maintenance_records
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_maintenance_history();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Bidirectional Deferred Cross-Table Triggers (INSERT / UPDATE / DELETE)
-- ----------------------------------------------------------------------------

-- 3a. Bookings: FULFILLED <-> exact 1 loan; CONFIRMED/CANCELLED/EXPIRED <-> 0 loans
CREATE OR REPLACE FUNCTION public.verify_booking_status_against_loans()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'FULFILLED' THEN
      RAISE EXCEPTION 'FULFILLED booking % cannot be deleted', OLD.id
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.loans l WHERE l.booking_id = OLD.id) THEN
      RAISE EXCEPTION 'Booking % cannot be deleted while referenced by a loan', OLD.id
        USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_loan_count
  FROM public.loans l
  WHERE l.booking_id = NEW.id;

  IF NEW.status = 'FULFILLED' AND v_loan_count <> 1 THEN
    RAISE EXCEPTION 'FULFILLED booking % must have exactly one loan (found: %)',
      NEW.id, v_loan_count
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('CONFIRMED', 'CANCELLED', 'EXPIRED') AND v_loan_count <> 0 THEN
    RAISE EXCEPTION 'Booking % with status % cannot have any loan (found: %)',
      NEW.id, NEW.status, v_loan_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- 3b. Loans: handle INSERT, UPDATE, DELETE and verify booking, projector & inspection
CREATE OR REPLACE FUNCTION public.verify_loan_cross_table_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_booking_status TEXT;
  v_projector_status TEXT;
  v_has_inspection BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT b.status INTO v_booking_status
    FROM public.bookings b
    WHERE b.id = OLD.booking_id;

    IF v_booking_status = 'FULFILLED' THEN
      RAISE EXCEPTION 'Cannot delete loan % while booking % remains FULFILLED',
        OLD.id, OLD.booking_id
        USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'ACTIVE' THEN
      SELECT p.physical_status INTO v_projector_status
      FROM public.projectors p
      WHERE p.id = OLD.projector_id;

      IF v_projector_status = 'BORROWED' THEN
        RAISE EXCEPTION 'Cannot delete ACTIVE loan % while projector % remains BORROWED',
          OLD.id, OLD.projector_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM public.return_inspections ri WHERE ri.loan_id = OLD.id) THEN
      RAISE EXCEPTION 'Cannot delete loan % while return_inspections references it',
        OLD.id
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  SELECT b.status INTO v_booking_status
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  IF v_booking_status IS DISTINCT FROM 'FULFILLED' THEN
    RAISE EXCEPTION 'Loan % requires booking % to be FULFILLED (actual: %)',
      NEW.id, NEW.booking_id, v_booking_status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'ACTIVE' THEN
    SELECT p.physical_status INTO v_projector_status
    FROM public.projectors p
    WHERE p.id = NEW.projector_id;

    IF v_projector_status IS DISTINCT FROM 'BORROWED' THEN
      RAISE EXCEPTION 'ACTIVE loan % requires projector % physical_status = BORROWED (actual: %)',
        NEW.id, NEW.projector_id, v_projector_status
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'RETURNED' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.return_inspections ri WHERE ri.loan_id = NEW.id
    ) INTO v_has_inspection;

    IF NOT v_has_inspection THEN
      RAISE EXCEPTION 'RETURNED loan % requires a corresponding return_inspections record',
        NEW.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- 3c. Projectors: physical_status = BORROWED <-> ACTIVE loan; MAINTENANCE guard
CREATE OR REPLACE FUNCTION public.verify_projector_status_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_has_active_loan BOOLEAN;
  v_has_active_maintenance BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.loans l WHERE l.projector_id = NEW.id AND l.status = 'ACTIVE'
  ) INTO v_has_active_loan;

  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_records m
    WHERE m.projector_id = NEW.id AND m.status = 'IN_PROGRESS'
  ) INTO v_has_active_maintenance;

  IF NEW.physical_status = 'BORROWED' AND NOT v_has_active_loan THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status BORROWED without an ACTIVE loan',
      NEW.id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.physical_status <> 'BORROWED' AND v_has_active_loan THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status % while an ACTIVE loan exists',
      NEW.id, NEW.physical_status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.physical_status <> 'MAINTENANCE' AND v_has_active_maintenance THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status % while maintenance is IN_PROGRESS',
      NEW.id, NEW.physical_status
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- 3d. Return Inspections: require RETURNED loan & consistent projector disposition
CREATE OR REPLACE FUNCTION public.verify_inspection_against_loan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan_status TEXT;
  v_projector_id UUID;
  v_projector_status TEXT;
  v_projector_active BOOLEAN;
  v_has_newer_state BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT l.status INTO v_loan_status
    FROM public.loans l
    WHERE l.id = OLD.loan_id;

    IF v_loan_status = 'RETURNED' THEN
      RAISE EXCEPTION 'Cannot delete return_inspections % while loan % is RETURNED',
        OLD.id, OLD.loan_id
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  SELECT l.status, l.projector_id
  INTO v_loan_status, v_projector_id
  FROM public.loans l
  WHERE l.id = NEW.loan_id;

  IF v_loan_status IS DISTINCT FROM 'RETURNED' THEN
    RAISE EXCEPTION 'return_inspections for loan % requires loan status = RETURNED (actual: %)',
      NEW.loan_id, v_loan_status
      USING ERRCODE = '23514';
  END IF;

  SELECT p.physical_status, p.is_active
  INTO v_projector_status, v_projector_active
  FROM public.projectors p
  WHERE p.id = v_projector_id;

  -- Check whether a subsequent ACTIVE loan, IN_PROGRESS maintenance, or newer
  -- returned loan has already superseded this inspection.
  SELECT (
    EXISTS (
      SELECT 1 FROM public.loans l2
      WHERE l2.projector_id = v_projector_id
        AND l2.id <> NEW.loan_id
        AND (l2.status = 'ACTIVE' OR l2.picked_up_at > NEW.inspected_at)
    )
    OR EXISTS (
      SELECT 1 FROM public.maintenance_records m
      WHERE m.projector_id = v_projector_id
        AND (m.status = 'IN_PROGRESS' OR m.started_at > NEW.inspected_at)
    )
  ) INTO v_has_newer_state;

  IF NOT v_has_newer_state AND v_projector_active THEN
    IF v_projector_status IS DISTINCT FROM NEW.unit_disposition THEN
      RAISE EXCEPTION
        'Projector % physical_status (%) must match return inspection unit_disposition (%)',
        v_projector_id, v_projector_status, NEW.unit_disposition
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- 3e. Maintenance Records: IN_PROGRESS requires projector MAINTENANCE & no ACTIVE loan
CREATE OR REPLACE FUNCTION public.verify_maintenance_against_projector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_projector_status TEXT;
BEGIN
  IF NEW.status = 'IN_PROGRESS' THEN
    SELECT p.physical_status INTO v_projector_status
    FROM public.projectors p
    WHERE p.id = NEW.projector_id;

    IF v_projector_status IS DISTINCT FROM 'MAINTENANCE' THEN
      RAISE EXCEPTION 'IN_PROGRESS maintenance % requires projector % physical_status = MAINTENANCE (actual: %)',
        NEW.id, NEW.projector_id, v_projector_status
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.projector_id = NEW.projector_id AND l.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'IN_PROGRESS maintenance % cannot coexist with ACTIVE loan on projector %',
        NEW.id, NEW.projector_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Re-register deferred constraint triggers so INSERT / UPDATE / DELETE and FK
-- columns are all covered (non-destructive check; replaces trigger event scope
-- via temporary check only when updating trigger definition).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bookings_verify_status_against_loans') THEN
    DROP TRIGGER trg_bookings_verify_status_against_loans ON public.bookings;
  END IF;
  CREATE CONSTRAINT TRIGGER trg_bookings_verify_status_against_loans
    AFTER INSERT OR UPDATE OF status, projector_id, komting_id OR DELETE ON public.bookings
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verify_booking_status_against_loans();

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_loans_verify_cross_table_consistency') THEN
    DROP TRIGGER trg_loans_verify_cross_table_consistency ON public.loans;
  END IF;
  CREATE CONSTRAINT TRIGGER trg_loans_verify_cross_table_consistency
    AFTER INSERT OR UPDATE OR DELETE ON public.loans
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verify_loan_cross_table_consistency();

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_projectors_verify_status_consistency') THEN
    DROP TRIGGER trg_projectors_verify_status_consistency ON public.projectors;
  END IF;
  CREATE CONSTRAINT TRIGGER trg_projectors_verify_status_consistency
    AFTER INSERT OR UPDATE OF physical_status, is_active ON public.projectors
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verify_projector_status_consistency();

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_inspections_verify_loan_returned') THEN
    DROP TRIGGER trg_return_inspections_verify_loan_returned ON public.return_inspections;
  END IF;
  CREATE CONSTRAINT TRIGGER trg_return_inspections_verify_loan_returned
    AFTER INSERT OR UPDATE OR DELETE ON public.return_inspections
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verify_inspection_against_loan();

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_maintenance_verify_projector_status') THEN
    DROP TRIGGER trg_maintenance_verify_projector_status ON public.maintenance_records;
  END IF;
  CREATE CONSTRAINT TRIGGER trg_maintenance_verify_projector_status
    AFTER INSERT OR UPDATE OF status, projector_id ON public.maintenance_records
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verify_maintenance_against_projector();
END $$;

COMMIT;
