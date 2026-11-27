-- ============================================================================
-- Migration 001: Extensions and Shared Trigger Functions
-- ============================================================================
-- Purpose:
--   1. Enable required PostgreSQL extensions (pgcrypto, btree_gist) for UUID
--      generation and time-range exclusion constraints.
--   2. Create shared trigger functions for UTC updated_at maintenance and
--      append-only enforcement on audit_logs.
--
-- Safety & Rollback Notes:
--   - Non-destructive; safe to run on an empty database or one where extensions
--     are already installed.
--   - All timestamps in PINJAM are stored in UTC (TIMESTAMPTZ) while
--     operational calendar rules use Asia/Jakarta.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Automatically updates `updated_at` to current UTC timestamp on row updates.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Enforces append-only immutability on public.audit_logs.
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; % operations are prohibited', TG_OP
    USING ERRCODE = '42501';
END;
$$;

COMMIT;
