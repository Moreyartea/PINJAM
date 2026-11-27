-- ============================================================================
-- Migration 007: Database Foundation Remediation (Integrity, Concurrency & RLS)
-- ============================================================================
-- Purpose:
--   Hardens relational integrity, cross-table state consistency, QR token
--   anti-replay lifecycle, concurrent idempotency support, and least-privilege
--   PostgreSQL/Supabase permissions on top of migrations 001..006 without
--   modifying historical migration files or dropping existing data.
--
-- Remediations Covered:
--   1. Booking <-> Loan composite FK (booking_id, projector_id, komting_id).
--   2. QR Token <-> Loan composite FK (loan_id, booking_id) + immutable used_at
--      lifecycle trigger preventing pickup/return replay or post-revoke use.
--   3. Loan RETURNED completeness (return_received_by required) + deferred
--      cross-table constraint triggers ensuring atomic consistency across
--      bookings, loans, return_inspections, maintenance_records, projectors.
--   4. Consistency constraints for projectors (is_active <-> physical_status),
--      komting_applications (review metadata), komting_assignments (ended_by),
--      audit_logs (actor_source <-> actor_role + BEFORE TRUNCATE block), and
--      idempotency_records (IN_PROGRESS lock state for concurrent requests).
--   5. Explicit privilege revocation (SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--      REFERENCES, TRIGGER), default privileges lockdown, and search_path = ''
--      hardening on all SECURITY DEFINER and trigger functions.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Harden search_path on existing functions from migrations 001, 004, 006
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; % operations are prohibited', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_booking_start_at_and_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.start_at := (NEW.booking_date + NEW.start_time) AT TIME ZONE 'Asia/Jakarta';

  IF (NEW.estimated_return_at AT TIME ZONE 'Asia/Jakarta')::date <> NEW.booking_date THEN
    RAISE EXCEPTION
      'estimated_return_at must be on the same Asia/Jakarta calendar date as booking_date (%).',
      NEW.booking_date
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_provider_user_id = (SELECT auth.uid()::text)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.auth_provider_user_id = (SELECT auth.uid()::text)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_provider_user_id = (SELECT auth.uid()::text)
      AND u.account_status = 'ACTIVE'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Composite Foreign Keys: Booking <-> Loan and QR Token <-> Loan
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_bookings_id_projector_komting'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT uq_bookings_id_projector_komting
      UNIQUE (id, projector_id, komting_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_loans_booking_identity'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT fk_loans_booking_identity
      FOREIGN KEY (booking_id, projector_id, komting_id)
      REFERENCES public.bookings (id, projector_id, komting_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_loans_id_booking'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT uq_loans_id_booking
      UNIQUE (id, booking_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_qr_tokens_loan_matches_booking'
  ) THEN
    ALTER TABLE public.qr_tokens
      ADD CONSTRAINT fk_qr_tokens_loan_matches_booking
      FOREIGN KEY (loan_id, booking_id)
      REFERENCES public.loans (id, booking_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. QR Token Lifecycle & Anti-Replay Constraints + Trigger
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qr_tokens_expires_after_created'
  ) THEN
    ALTER TABLE public.qr_tokens
      ADD CONSTRAINT chk_qr_tokens_expires_after_created
      CHECK (expires_at > created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qr_tokens_scope_usage'
  ) THEN
    ALTER TABLE public.qr_tokens
      ADD CONSTRAINT chk_qr_tokens_scope_usage
      CHECK (scope <> 'PICKUP' OR return_used_at IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qr_tokens_pickup_requires_loan'
  ) THEN
    ALTER TABLE public.qr_tokens
      ADD CONSTRAINT chk_qr_tokens_pickup_requires_loan
      CHECK (pickup_used_at IS NULL OR loan_id IS NOT NULL);
  END IF;
END $$;

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

  IF OLD.loan_id IS NOT NULL AND NEW.loan_id IS DISTINCT FROM OLD.loan_id THEN
    RAISE EXCEPTION 'qr_tokens.loan_id cannot be reassigned once linked'
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

  IF NEW.revoked_at IS NOT NULL THEN
    IF (OLD.pickup_used_at IS NULL AND NEW.pickup_used_at IS NOT NULL)
       OR (OLD.return_used_at IS NULL AND NEW.return_used_at IS NOT NULL) THEN
      RAISE EXCEPTION 'revoked qr_token cannot be consumed for pickup or return'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_qr_tokens_lifecycle_guard'
  ) THEN
    CREATE TRIGGER trg_qr_tokens_lifecycle_guard
      BEFORE UPDATE ON public.qr_tokens
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_qr_token_lifecycle();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Loan Return Completeness & Cross-Table Atomic State Triggers
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loans_return_received_consistency'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT chk_loans_return_received_consistency
      CHECK (
        (status = 'ACTIVE' AND return_received_by IS NULL AND return_representative_name IS NULL)
        OR (status = 'RETURNED' AND return_received_by IS NOT NULL)
      );
  END IF;
END $$;

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

CREATE OR REPLACE FUNCTION public.verify_booking_status_against_loans()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'FULFILLED' AND EXISTS (
    SELECT 1 FROM public.loans l WHERE l.booking_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Booking % cannot leave FULFILLED status while a loan references it',
      NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_projector_status_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.physical_status <> 'BORROWED' AND EXISTS (
    SELECT 1 FROM public.loans l WHERE l.projector_id = NEW.id AND l.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status % while an ACTIVE loan exists',
      NEW.id, NEW.physical_status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.physical_status <> 'MAINTENANCE' AND EXISTS (
    SELECT 1 FROM public.maintenance_records m
    WHERE m.projector_id = NEW.id AND m.status = 'IN_PROGRESS'
  ) THEN
    RAISE EXCEPTION 'Projector % cannot have physical_status % while maintenance is IN_PROGRESS',
      NEW.id, NEW.physical_status
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_inspection_against_loan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan_status TEXT;
BEGIN
  SELECT l.status INTO v_loan_status
  FROM public.loans l
  WHERE l.id = NEW.loan_id;

  IF v_loan_status IS DISTINCT FROM 'RETURNED' THEN
    RAISE EXCEPTION 'return_inspections for loan % requires loan status = RETURNED (actual: %)',
      NEW.loan_id, v_loan_status
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

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
  END IF;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_loans_verify_cross_table_consistency'
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_loans_verify_cross_table_consistency
      AFTER INSERT OR UPDATE ON public.loans
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.verify_loan_cross_table_consistency();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bookings_verify_status_against_loans'
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_bookings_verify_status_against_loans
      AFTER UPDATE OF status ON public.bookings
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.verify_booking_status_against_loans();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_projectors_verify_status_consistency'
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_projectors_verify_status_consistency
      AFTER UPDATE OF physical_status ON public.projectors
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.verify_projector_status_consistency();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_inspections_verify_loan_returned'
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_return_inspections_verify_loan_returned
      AFTER INSERT OR UPDATE ON public.return_inspections
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.verify_inspection_against_loan();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_maintenance_verify_projector_status'
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_maintenance_verify_projector_status
      AFTER INSERT OR UPDATE OF status ON public.maintenance_records
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.verify_maintenance_against_projector();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Additional Domain & Infrastructure Consistency Fixes
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Projectors: is_active must agree with physical_status = 'INACTIVE'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_projectors_active_status_consistency'
  ) THEN
    ALTER TABLE public.projectors
      ADD CONSTRAINT chk_projectors_active_status_consistency
      CHECK (
        (is_active = TRUE AND physical_status IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE'))
        OR (is_active = FALSE AND physical_status = 'INACTIVE')
      );
  END IF;

  -- Komting Applications: review metadata required on final decision
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_komting_applications_review_consistency'
  ) THEN
    ALTER TABLE public.komting_applications
      ADD CONSTRAINT chk_komting_applications_review_consistency
      CHECK (
        status NOT IN ('APPROVED', 'REJECTED')
        OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_komting_applications_review_time_order'
  ) THEN
    ALTER TABLE public.komting_applications
      ADD CONSTRAINT chk_komting_applications_review_time_order
      CHECK (reviewed_at IS NULL OR reviewed_at >= submitted_at);
  END IF;

  -- Komting Assignments: ended_by must match status
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_komting_assignments_ended_by_consistency'
  ) THEN
    ALTER TABLE public.komting_assignments
      ADD CONSTRAINT chk_komting_assignments_ended_by_consistency
      CHECK (
        (status = 'ACTIVE' AND ended_by IS NULL)
        OR (status IN ('INACTIVE', 'REPLACED') AND ended_by IS NOT NULL)
      );
  END IF;

  -- Audit Logs: strict pairing between actor_role, actor_source, and actor_user_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_logs_actor_source_role'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT chk_audit_logs_actor_source_role
      CHECK (
        (actor_role = 'SYSTEM' AND actor_source = 'SYSTEM_JOB' AND actor_user_id IS NULL)
        OR (
          actor_role IN ('KOMTING', 'STAFF', 'ADMIN')
          AND actor_source = 'API'
          AND actor_user_id IS NOT NULL
        )
      );
  END IF;
END $$;

-- Block TRUNCATE on audit_logs as well as UPDATE/DELETE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_prevent_truncate'
  ) THEN
    CREATE TRIGGER trg_audit_logs_prevent_truncate
      BEFORE TRUNCATE ON public.audit_logs
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.prevent_audit_log_mutation();
  END IF;
END $$;

-- Idempotency Records: support concurrent IN_PROGRESS reservations
ALTER TABLE public.idempotency_records
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.idempotency_records
  ALTER COLUMN response_status DROP NOT NULL,
  ALTER COLUMN response_body DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_idempotency_status'
  ) THEN
    ALTER TABLE public.idempotency_records
      ADD CONSTRAINT chk_idempotency_status
      CHECK (status IN ('IN_PROGRESS', 'COMPLETED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_idempotency_status_consistency'
  ) THEN
    ALTER TABLE public.idempotency_records
      ADD CONSTRAINT chk_idempotency_status_consistency
      CHECK (
        (status = 'IN_PROGRESS' AND response_status IS NULL AND response_body IS NULL)
        OR (status = 'COMPLETED' AND response_status IS NOT NULL AND response_body IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_idempotency_records_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_idempotency_records_set_updated_at
      BEFORE UPDATE ON public.idempotency_records
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. RLS Policy Tightening & Least-Privilege Grants
-- ----------------------------------------------------------------------------

-- Tighten SELECT policies on users and komting_assignments to prevent STAFF
-- from reading ADMIN accounts or historical assignment records unnecessarily.
ALTER POLICY users_select_own_or_staff_admin
  ON public.users
  USING (
    auth_provider_user_id = (SELECT auth.uid()::text)
    OR (
      public.current_app_user_is_active()
      AND public.current_app_user_role() = 'ADMIN'
    )
    OR (
      public.current_app_user_is_active()
      AND public.current_app_user_role() = 'STAFF'
      AND role = 'KOMTING'
    )
  );

ALTER POLICY komting_assignments_select_own_or_staff_admin
  ON public.komting_assignments
  USING (
    user_id = public.current_app_user_id()
    OR (
      public.current_app_user_is_active()
      AND public.current_app_user_role() = 'ADMIN'
    )
    OR (
      public.current_app_user_is_active()
      AND public.current_app_user_role() = 'STAFF'
      AND status = 'ACTIVE'
    )
  );

-- Explicitly revoke all table, sequence, and function privileges from client roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Lock down default privileges for any future objects in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Grant explicit SELECT only on client-readable tables to authenticated
-- (anon retains zero privileges; qr_tokens, email_outbox, idempotency_records
-- retain zero privileges for both anon and authenticated).
GRANT SELECT ON
  public.users,
  public.komting_applications,
  public.komting_assignments,
  public.projectors,
  public.operating_hours,
  public.bookings,
  public.loans,
  public.return_inspections,
  public.maintenance_records,
  public.audit_logs
TO authenticated;

-- Grant EXECUTE only on the three RLS helper functions to authenticated
GRANT EXECUTE ON FUNCTION
  public.current_app_user_id(),
  public.current_app_user_role(),
  public.current_app_user_is_active()
TO authenticated;

COMMIT;
