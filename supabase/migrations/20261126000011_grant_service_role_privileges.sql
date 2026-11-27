-- ============================================================================
-- Migration 011: Explicit service_role Grants in public Schema
-- ============================================================================
-- Purpose:
--   Resolves PostgreSQL 42501 ("permission denied for table users") when
--   Supabase backend server clients operating under the service_role database role query or
--   mutate tables in schema public after migrations 001..010 were applied via
--   psql without Supabase default privileges for service_role.
--
-- Security Notes:
--   - Does NOT grant any privileges to anon or authenticated.
--   - Grants SELECT, INSERT on public.audit_logs (combined with triggers
--     blocking UPDATE/DELETE/TRUNCATE) and ALL on the other 12 tables,
--     sequences, and functions in public exclusively to service_role.
--   - Guarded by pg_roles check so plain non-Supabase PostgreSQL test runs
--     remain compatible.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;

    GRANT ALL ON TABLE
      public.users,
      public.komting_applications,
      public.komting_assignments,
      public.projectors,
      public.operating_hours,
      public.bookings,
      public.loans,
      public.return_inspections,
      public.maintenance_records,
      public.qr_tokens,
      public.email_outbox,
      public.idempotency_records
    TO service_role;

    -- audit_logs is strictly append-only
    GRANT SELECT, INSERT ON TABLE public.audit_logs TO service_role;

    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT ALL ON SEQUENCES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO service_role;
  END IF;
END $$;

COMMIT;
