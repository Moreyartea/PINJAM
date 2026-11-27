-- ============================================================================
-- Migration 003: Projector Inventory & Operating Hours Tables
-- ============================================================================
-- Purpose:
--   Creates tables for projector physical assets and daily operating hours
--   configuration in Asia/Jakarta.
--
-- Tables:
--   - public.projectors
--   - public.operating_hours
--
-- Key Invariants Enforced:
--   - physical_status tracks actual unit condition (AVAILABLE, BORROWED,
--     MAINTENANCE, INACTIVE) and is strictly separated from booking status.
--   - Unique asset_code across projectors (normalized case/whitespace).
--   - One operating_hours configuration per service_date in Asia/Jakarta,
--     with closes_at > opens_at and optional admin_early_open_at <= opens_at.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. public.projectors
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  physical_status TEXT NOT NULL DEFAULT 'AVAILABLE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_projectors_asset_code_non_empty CHECK (btrim(asset_code) <> ''),
  CONSTRAINT chk_projectors_name_non_empty CHECK (btrim(name) <> ''),
  CONSTRAINT chk_projectors_physical_status CHECK (
    physical_status IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE', 'INACTIVE')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projectors_asset_code_lower
  ON public.projectors (LOWER(btrim(asset_code)));

CREATE INDEX IF NOT EXISTS idx_projectors_status_active
  ON public.projectors (physical_status, is_active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_projectors_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_projectors_set_updated_at
      BEFORE UPDATE ON public.projectors
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. public.operating_hours
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operating_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date DATE NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  opens_at TIME WITHOUT TIME ZONE NOT NULL,
  closes_at TIME WITHOUT TIME ZONE NOT NULL,
  admin_early_open_at TIME WITHOUT TIME ZONE,
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_operating_hours_timezone CHECK (timezone = 'Asia/Jakarta'),
  CONSTRAINT chk_operating_hours_window CHECK (closes_at > opens_at),
  CONSTRAINT chk_operating_hours_early_open CHECK (
    admin_early_open_at IS NULL OR admin_early_open_at <= opens_at
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_operating_hours_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_operating_hours_set_updated_at
      BEFORE UPDATE ON public.operating_hours
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMIT;
