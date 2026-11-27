-- ============================================================================
-- Migration 002: Identity & Komting Domain Tables
-- ============================================================================
-- Purpose:
--   Creates tables for application users, komting registration/replacement
--   applications, and komting class assignments with historical preservation.
--
-- Tables:
--   - public.users
--   - public.komting_applications
--   - public.komting_assignments
--
-- Key Invariants Enforced:
--   - One auth provider identity maps to at most one application user profile.
--   - Case-insensitive unique email per user.
--   - At most one pending/active komting application per user at a time.
--   - At most one ACTIVE komting assignment per class (case-insensitive).
--   - At most one ACTIVE komting assignment per user.
--   - Historical assignments and applications are preserved (ON DELETE RESTRICT).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. public.users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider_user_id TEXT UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_users_email_non_empty CHECK (btrim(email) <> ''),
  CONSTRAINT chk_users_full_name_non_empty CHECK (btrim(full_name) <> ''),
  CONSTRAINT chk_users_role CHECK (role IN ('KOMTING', 'STAFF', 'ADMIN')),
  CONSTRAINT chk_users_account_status CHECK (
    account_status IN ('PENDING_VERIFICATION', 'ACTIVE', 'REJECTED', 'INACTIVE')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
  ON public.users (LOWER(btrim(email)));

CREATE INDEX IF NOT EXISTS idx_users_role_status
  ON public.users (role, account_status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_users_set_updated_at
      BEFORE UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. public.komting_applications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.komting_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  identity_photo_storage_key TEXT NOT NULL,
  application_type TEXT NOT NULL DEFAULT 'NEW',
  status TEXT NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  admin_note TEXT,
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_komting_applications_student_id_non_empty CHECK (btrim(student_id) <> ''),
  CONSTRAINT chk_komting_applications_class_name_non_empty CHECK (btrim(class_name) <> ''),
  CONSTRAINT chk_komting_applications_photo_key_non_empty CHECK (
    btrim(identity_photo_storage_key) <> ''
  ),
  CONSTRAINT chk_komting_applications_type CHECK (
    application_type IN ('NEW', 'REPLACEMENT')
  ),
  CONSTRAINT chk_komting_applications_status CHECK (
    status IN (
      'PENDING_EMAIL_VERIFICATION',
      'PENDING_VERIFICATION',
      'PENDING_REVIEW',
      'PENDING_REPLACEMENT_NOTICE',
      'APPROVED',
      'REJECTED',
      'WITHDRAWN'
    )
  ),
  CONSTRAINT chk_komting_applications_rejection_reason CHECK (
    status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
  )
);

-- Prevent a student from holding more than one active/pending application.
CREATE UNIQUE INDEX IF NOT EXISTS uq_komting_applications_active_per_user
  ON public.komting_applications (user_id)
  WHERE status IN (
    'PENDING_EMAIL_VERIFICATION',
    'PENDING_VERIFICATION',
    'PENDING_REVIEW',
    'PENDING_REPLACEMENT_NOTICE'
  );

CREATE INDEX IF NOT EXISTS idx_komting_applications_status_submitted_at
  ON public.komting_applications (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_komting_applications_class_status
  ON public.komting_applications (LOWER(btrim(class_name)), status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_komting_applications_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_komting_applications_set_updated_at
      BEFORE UPDATE ON public.komting_applications
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. public.komting_assignments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.komting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  class_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  ended_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  end_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_komting_assignments_class_name_non_empty CHECK (btrim(class_name) <> ''),
  CONSTRAINT chk_komting_assignments_status CHECK (
    status IN ('ACTIVE', 'INACTIVE', 'REPLACED')
  ),
  CONSTRAINT chk_komting_assignments_time_order CHECK (
    ended_at IS NULL OR ended_at >= started_at
  ),
  CONSTRAINT chk_komting_assignments_ended_consistency CHECK (
    (status = 'ACTIVE' AND ended_at IS NULL)
    OR (status IN ('INACTIVE', 'REPLACED') AND ended_at IS NOT NULL)
  )
);

-- At most one ACTIVE komting per class (normalized case/whitespace).
CREATE UNIQUE INDEX IF NOT EXISTS uq_komting_assignments_active_class
  ON public.komting_assignments (LOWER(btrim(class_name)))
  WHERE status = 'ACTIVE';

-- At most one ACTIVE assignment per student.
CREATE UNIQUE INDEX IF NOT EXISTS uq_komting_assignments_active_user
  ON public.komting_assignments (user_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_komting_assignments_user_started_at
  ON public.komting_assignments (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_komting_assignments_class_started_at
  ON public.komting_assignments (LOWER(btrim(class_name)), started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_komting_assignments_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_komting_assignments_set_updated_at
      BEFORE UPDATE ON public.komting_assignments
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMIT;
