-- ============================================================================
-- Migration 006: Row Level Security (RLS) & Access Policies
-- ============================================================================
-- Purpose:
--   Enables Row Level Security on all 13 public tables and configures
--   least-privilege read policies aligned with PRD_PINJAM_FINAL.md §5.4,
--   API_CONTRACT_PINJAM.md §3.4, and BACKEND_SPEC_PINJAM.md §6.3.
--
-- Architecture & Assumptions:
--   - Designed for Supabase PostgreSQL where auth.uid() identifies the
--     authenticated user JWT.
--   - All write operations (INSERT, UPDATE, DELETE) are performed exclusively
--     by backend server APIs/workers (using service_role / privileged backend
--     connection) to enforce atomic transactions, locking, idempotency,
--     outbox events, and audit logging. Client roles (anon, authenticated)
--     have zero direct write access.
--   - Internal security/operational tables (qr_tokens, email_outbox,
--     idempotency_records) are default-deny for anon and authenticated.
--   - Private Storage bucket policies (storage.objects) are NOT included here
--     until storage provider, bucket names, and file rules are finalized.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper functions for RLS (SECURITY DEFINER to avoid recursion on users)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_provider_user_id = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.auth_provider_user_id = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_provider_user_id = auth.uid()::text
      AND u.account_status = 'ACTIVE'
  );
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_is_active() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user_is_active() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Defense-in-depth: revoke direct client write privileges
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Enable RLS on all 13 domain & infrastructure tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.komting_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.komting_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_records ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Read (SELECT) Policies
-- ----------------------------------------------------------------------------

-- public.users:
-- - Authenticated user can read their own profile (even while PENDING_VERIFICATION).
-- - Active ADMIN and STAFF can read user profiles required for administration
--   and operational handover views.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_select_own_or_staff_admin'
  ) THEN
    CREATE POLICY users_select_own_or_staff_admin
      ON public.users
      FOR SELECT
      TO authenticated
      USING (
        auth_provider_user_id = auth.uid()::text
        OR (
          public.current_app_user_is_active()
          AND public.current_app_user_role() IN ('STAFF', 'ADMIN')
        )
      );
  END IF;
END $$;

-- public.komting_applications:
-- - Applicant can view their own applications.
-- - Active ADMIN can view all applications. STAFF and other KOMTING cannot.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'komting_applications'
      AND policyname = 'komting_applications_select_own_or_admin'
  ) THEN
    CREATE POLICY komting_applications_select_own_or_admin
      ON public.komting_applications
      FOR SELECT
      TO authenticated
      USING (
        user_id = public.current_app_user_id()
        OR (
          public.current_app_user_is_active()
          AND public.current_app_user_role() = 'ADMIN'
        )
      );
  END IF;
END $$;

-- public.komting_assignments:
-- - Owner can view their own assignment history.
-- - Active STAFF and ADMIN can view assignments for operational/admin needs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'komting_assignments'
      AND policyname = 'komting_assignments_select_own_or_staff_admin'
  ) THEN
    CREATE POLICY komting_assignments_select_own_or_staff_admin
      ON public.komting_assignments
      FOR SELECT
      TO authenticated
      USING (
        user_id = public.current_app_user_id()
        OR (
          public.current_app_user_is_active()
          AND public.current_app_user_role() IN ('STAFF', 'ADMIN')
        )
      );
  END IF;
END $$;

-- public.projectors:
-- - Active authenticated users (KOMTING, STAFF, ADMIN) can read projector inventory.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projectors' AND policyname = 'projectors_select_active_users'
  ) THEN
    CREATE POLICY projectors_select_active_users
      ON public.projectors
      FOR SELECT
      TO authenticated
      USING (public.current_app_user_is_active());
  END IF;
END $$;

-- public.operating_hours:
-- - Active authenticated users can read operating hours configuration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'operating_hours'
      AND policyname = 'operating_hours_select_active_users'
  ) THEN
    CREATE POLICY operating_hours_select_active_users
      ON public.operating_hours
      FOR SELECT
      TO authenticated
      USING (public.current_app_user_is_active());
  END IF;
END $$;

-- public.bookings:
-- - KOMTING can only read their own bookings.
-- - Active STAFF and ADMIN can read all bookings.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bookings'
      AND policyname = 'bookings_select_own_or_staff_admin'
  ) THEN
    CREATE POLICY bookings_select_own_or_staff_admin
      ON public.bookings
      FOR SELECT
      TO authenticated
      USING (
        (
          public.current_app_user_is_active()
          AND public.current_app_user_role() = 'KOMTING'
          AND komting_id = public.current_app_user_id()
        )
        OR (
          public.current_app_user_is_active()
          AND public.current_app_user_role() IN ('STAFF', 'ADMIN')
        )
      );
  END IF;
END $$;

-- public.loans:
-- - KOMTING can only read their own loans.
-- - Active STAFF and ADMIN can read all loans.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'loans'
      AND policyname = 'loans_select_own_or_staff_admin'
  ) THEN
    CREATE POLICY loans_select_own_or_staff_admin
      ON public.loans
      FOR SELECT
      TO authenticated
      USING (
        (
          public.current_app_user_is_active()
          AND public.current_app_user_role() = 'KOMTING'
          AND komting_id = public.current_app_user_id()
        )
        OR (
          public.current_app_user_is_active()
          AND public.current_app_user_role() IN ('STAFF', 'ADMIN')
        )
      );
  END IF;
END $$;

-- public.return_inspections:
-- - Active STAFF and ADMIN can read all return inspections.
-- - Active KOMTING can read inspections for their own loans.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'return_inspections'
      AND policyname = 'return_inspections_select_own_or_staff_admin'
  ) THEN
    CREATE POLICY return_inspections_select_own_or_staff_admin
      ON public.return_inspections
      FOR SELECT
      TO authenticated
      USING (
        (
          public.current_app_user_is_active()
          AND public.current_app_user_role() IN ('STAFF', 'ADMIN')
        )
        OR (
          public.current_app_user_is_active()
          AND public.current_app_user_role() = 'KOMTING'
          AND EXISTS (
            SELECT 1
            FROM public.loans l
            WHERE l.id = loan_id
              AND l.komting_id = public.current_app_user_id()
          )
        )
      );
  END IF;
END $$;

-- public.maintenance_records:
-- - Active STAFF and ADMIN only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'maintenance_records'
      AND policyname = 'maintenance_records_select_staff_admin'
  ) THEN
    CREATE POLICY maintenance_records_select_staff_admin
      ON public.maintenance_records
      FOR SELECT
      TO authenticated
      USING (
        public.current_app_user_is_active()
        AND public.current_app_user_role() IN ('STAFF', 'ADMIN')
      );
  END IF;
END $$;

-- public.audit_logs:
-- - Active ADMIN only (STAFF audit scope is pending clarification in API Contract §3.4).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_select_admin_only'
  ) THEN
    CREATE POLICY audit_logs_select_admin_only
      ON public.audit_logs
      FOR SELECT
      TO authenticated
      USING (
        public.current_app_user_is_active()
        AND public.current_app_user_role() = 'ADMIN'
      );
  END IF;
END $$;

-- public.qr_tokens, public.email_outbox, public.idempotency_records:
-- - RLS enabled with zero policies for anon/authenticated (default-deny).
--   Only privileged backend server connections (service_role) access these tables.

COMMIT;
