-- ============================================================================
-- Migration 004: Booking, Loan, Return Inspection, Maintenance & QR Tables
-- ============================================================================
-- Purpose:
--   Creates the core operational transaction tables and enforces database-level
--   anti-overlap, single-active-booking, single-active-loan, mandatory
--   return evidence, and single-active-maintenance invariants.
--
-- Tables:
--   - public.bookings
--   - public.loans
--   - public.return_inspections
--   - public.maintenance_records
--   - public.qr_tokens
--
-- Key Invariants Enforced:
--   - Unique booking_code and at most one CONFIRMED booking per komting.
--   - PostgreSQL GiST exclusion constraint prevents overlapping CONFIRMED
--     bookings for the same projector_id across [start_at, estimated_return_at).
--   - estimated_return_at must be after start_at and on the same calendar date
--     in Asia/Jakarta (enforced via trigger + CHECK constraint).
--   - One loan per booking_id, at most one ACTIVE loan per komting, and at most
--     one ACTIVE loan per projector.
--   - Return evidence photo is mandatory when projector_condition = 'DAMAGED'
--     or accessories_condition = 'INCOMPLETE'.
--   - At most one IN_PROGRESS maintenance record per projector.
--   - One opaque hashed QR token per booking, supporting sequential PICKUP
--     then RETURN without allowing replay of completed steps.
-- ============================================================================

BEGIN;

-- Synchronizes UTC start_at from (booking_date, start_time) in Asia/Jakarta
-- and enforces same-day estimated_return_at in Asia/Jakarta.
CREATE OR REPLACE FUNCTION public.sync_booking_start_at_and_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
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

-- ----------------------------------------------------------------------------
-- 1. public.bookings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT NOT NULL UNIQUE,
  komting_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  projector_id UUID NOT NULL REFERENCES public.projectors(id) ON DELETE RESTRICT,
  booking_date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  estimated_return_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  operating_hours_snapshot JSONB NOT NULL,
  pickup_window_start_at TIMESTAMPTZ NOT NULL,
  pickup_window_end_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bookings_code_non_empty CHECK (btrim(booking_code) <> ''),
  CONSTRAINT chk_bookings_status CHECK (
    status IN ('CONFIRMED', 'FULFILLED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT chk_bookings_return_after_start CHECK (estimated_return_at > start_at),
  CONSTRAINT chk_bookings_pickup_window CHECK (pickup_window_end_at > pickup_window_start_at),
  CONSTRAINT chk_bookings_snapshot_object CHECK (
    jsonb_typeof(operating_hours_snapshot) = 'object'
  ),
  CONSTRAINT chk_bookings_cancelled_consistency CHECK (
    status <> 'CANCELLED' OR cancelled_at IS NOT NULL
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'excl_bookings_no_overlap_per_projector'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT excl_bookings_no_overlap_per_projector
      EXCLUDE USING gist (
        projector_id WITH =,
        tstzrange(start_at, estimated_return_at, '[)') WITH &&
      )
      WHERE (status = 'CONFIRMED');
  END IF;
END $$;

-- One active booking (CONFIRMED) per komting at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_per_komting
  ON public.bookings (komting_id)
  WHERE status = 'CONFIRMED';

CREATE INDEX IF NOT EXISTS idx_bookings_date_status
  ON public.bookings (booking_date, status);

CREATE INDEX IF NOT EXISTS idx_bookings_komting_created_at
  ON public.bookings (komting_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_projector_date_status
  ON public.bookings (projector_id, booking_date, status);

CREATE INDEX IF NOT EXISTS idx_bookings_expiry_candidates
  ON public.bookings (pickup_window_end_at)
  WHERE status = 'CONFIRMED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bookings_sync_start_at_and_validate'
  ) THEN
    CREATE TRIGGER trg_bookings_sync_start_at_and_validate
      BEFORE INSERT OR UPDATE ON public.bookings
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_booking_start_at_and_validate();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bookings_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_bookings_set_updated_at
      BEFORE UPDATE ON public.bookings
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. public.loans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  projector_id UUID NOT NULL REFERENCES public.projectors(id) ON DELETE RESTRICT,
  komting_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  picked_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pickup_processed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  pickup_received_by TEXT NOT NULL,
  representative_name TEXT,
  returned_at TIMESTAMPTZ,
  return_processed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  return_received_by TEXT,
  return_representative_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_loans_status CHECK (status IN ('ACTIVE', 'RETURNED')),
  CONSTRAINT chk_loans_pickup_received_by CHECK (
    pickup_received_by IN ('KOMTING', 'REPRESENTATIVE')
  ),
  CONSTRAINT chk_loans_pickup_representative_name CHECK (
    pickup_received_by <> 'REPRESENTATIVE'
    OR (representative_name IS NOT NULL AND btrim(representative_name) <> '')
  ),
  CONSTRAINT chk_loans_return_received_by CHECK (
    return_received_by IS NULL OR return_received_by IN ('KOMTING', 'REPRESENTATIVE')
  ),
  CONSTRAINT chk_loans_return_representative_name CHECK (
    return_received_by IS NULL
    OR return_received_by <> 'REPRESENTATIVE'
    OR (return_representative_name IS NOT NULL AND btrim(return_representative_name) <> '')
  ),
  CONSTRAINT chk_loans_return_time_order CHECK (
    returned_at IS NULL OR returned_at >= picked_up_at
  ),
  CONSTRAINT chk_loans_status_consistency CHECK (
    (status = 'ACTIVE' AND returned_at IS NULL AND return_processed_by IS NULL)
    OR (status = 'RETURNED' AND returned_at IS NOT NULL AND return_processed_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_active_per_komting
  ON public.loans (komting_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_active_per_projector
  ON public.loans (projector_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_loans_status_picked_up_at
  ON public.loans (status, picked_up_at DESC);

CREATE INDEX IF NOT EXISTS idx_loans_komting_picked_up_at
  ON public.loans (komting_id, picked_up_at DESC);

CREATE INDEX IF NOT EXISTS idx_loans_projector_status
  ON public.loans (projector_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_loans_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_loans_set_updated_at
      BEFORE UPDATE ON public.loans
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. public.return_inspections
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL UNIQUE REFERENCES public.loans(id) ON DELETE RESTRICT,
  projector_condition TEXT NOT NULL,
  accessories_condition TEXT NOT NULL,
  note TEXT,
  evidence_photo_storage_key TEXT,
  unit_disposition TEXT NOT NULL,
  inspected_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_return_inspections_projector_condition CHECK (
    projector_condition IN ('NORMAL', 'DAMAGED')
  ),
  CONSTRAINT chk_return_inspections_accessories_condition CHECK (
    accessories_condition IN ('COMPLETE', 'INCOMPLETE')
  ),
  CONSTRAINT chk_return_inspections_unit_disposition CHECK (
    unit_disposition IN ('AVAILABLE', 'MAINTENANCE')
  ),
  CONSTRAINT chk_return_inspections_evidence_required CHECK (
    (projector_condition = 'NORMAL' AND accessories_condition = 'COMPLETE')
    OR (evidence_photo_storage_key IS NOT NULL AND btrim(evidence_photo_storage_key) <> '')
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_inspections_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_return_inspections_set_updated_at
      BEFORE UPDATE ON public.return_inspections
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. public.maintenance_records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projector_id UUID NOT NULL REFERENCES public.projectors(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolution_note TEXT,
  completed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_maintenance_records_reason_non_empty CHECK (btrim(reason) <> ''),
  CONSTRAINT chk_maintenance_records_status CHECK (
    status IN ('IN_PROGRESS', 'COMPLETED')
  ),
  CONSTRAINT chk_maintenance_records_time_order CHECK (
    completed_at IS NULL OR completed_at >= started_at
  ),
  CONSTRAINT chk_maintenance_records_status_consistency CHECK (
    (status = 'IN_PROGRESS' AND completed_at IS NULL AND completed_by IS NULL)
    OR (status = 'COMPLETED' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_records_active_per_projector
  ON public.maintenance_records (projector_id)
  WHERE status = 'IN_PROGRESS';

CREATE INDEX IF NOT EXISTS idx_maintenance_records_status_started_at
  ON public.maintenance_records (status, started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_maintenance_records_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_maintenance_records_set_updated_at
      BEFORE UPDATE ON public.maintenance_records
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. public.qr_tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  loan_id UUID UNIQUE REFERENCES public.loans(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'PICKUP_AND_RETURN',
  expires_at TIMESTAMPTZ NOT NULL,
  pickup_used_at TIMESTAMPTZ,
  return_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_qr_tokens_hash_non_empty CHECK (btrim(token_hash) <> ''),
  CONSTRAINT chk_qr_tokens_scope CHECK (
    scope IN ('PICKUP', 'RETURN', 'PICKUP_AND_RETURN')
  ),
  CONSTRAINT chk_qr_tokens_usage_order CHECK (
    return_used_at IS NULL
    OR (pickup_used_at IS NOT NULL AND loan_id IS NOT NULL AND return_used_at >= pickup_used_at)
  )
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_active_expires_at
  ON public.qr_tokens (expires_at)
  WHERE revoked_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_qr_tokens_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_qr_tokens_set_updated_at
      BEFORE UPDATE ON public.qr_tokens
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMIT;
