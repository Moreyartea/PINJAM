-- ============================================================================
-- Migration 016: BE-5 Loan Return, Projector Inspection & Fine Management
-- ============================================================================
-- Purpose:
--   Implements Sprint BE-5 database requirements:
--     1. Creates public.loan_fines table with strict monetary precision,
--        overdue tracking, uniqueness per loan, and RLS policies.
--     2. Configures private inspection-evidence storage bucket if storage exists.
--     3. Creates public.rpc_staff_confirm_return atomic transactional function:
--        - Strictly validates QR token hash, expiration, revocation, scope,
--          and usage flags (pickup_used_at NOT NULL, return_used_at IS NULL).
--        - Locks loan, booking, projector, and QR token.
--        - Enforces inspection condition and required photo evidence.
--        - Enforces business rules on projector disposition:
--            * DAMAGED or INCOMPLETE defaults to MAINTENANCE and CANNOT be AVAILABLE.
--            * NORMAL + COMPLETE defaults to AVAILABLE.
--        - Enforces PRD initial release fine assessment:
--            * Automatic late return fine amount is Rp0 with status EXEMPT.
--            * Overdue duration tracked in overdue_minutes.
--            * Positive manual fines ONLY permitted for DAMAGE or LOSS with mandatory notes.
--            * Positive manual fine on NONE or LATE_RETURN is rejected.
--            * Negative fine amounts are rejected.
--        - Enforces uniqueness: at most one inspection and one fine per loan.
--        - Avoids duplicate active maintenance records.
--        - Atomically transitions loan to RETURNED, projector to disposition,
--          marks QR token as returned, writes inspection and fine records,
--          emits append-only LOAN_RETURN_CONFIRMED, LOAN_INSPECTED, LOAN_FINE_RECORDED audit logs,
--          and queues transactional LOAN_RETURNED notification event.
--
-- Security Notes:
--   - RPC uses SECURITY DEFINER with SET search_path = ''.
--   - EXECUTE revoked from PUBLIC, anon, authenticated, granted strictly to service_role.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Storage Bucket for Inspection Evidence Photos
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'inspection-evidence',
      'inspection-evidence',
      false,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. public.loan_fines Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE RESTRICT,
  fine_type TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  overdue_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  calculation_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_loan_fines_type CHECK (
    fine_type IN ('LATE_RETURN', 'DAMAGE', 'LOSS', 'NONE')
  ),
  CONSTRAINT chk_loan_fines_status CHECK (
    status IN ('PENDING', 'WAIVED', 'PAID', 'EXEMPT')
  ),
  CONSTRAINT chk_loan_fines_amount CHECK (amount >= 0),
  CONSTRAINT chk_loan_fines_overdue_minutes CHECK (overdue_minutes >= 0),
  CONSTRAINT uq_loan_fines_loan_id UNIQUE (loan_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_loan_fines_loan_id'
  ) THEN
    ALTER TABLE public.loan_fines ADD CONSTRAINT uq_loan_fines_loan_id UNIQUE (loan_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_loan_fines_loan_id
  ON public.loan_fines (loan_id);

CREATE INDEX IF NOT EXISTS idx_loan_fines_status
  ON public.loan_fines (status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_loan_fines_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_loan_fines_set_updated_at
      BEFORE UPDATE ON public.loan_fines
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.loan_fines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'loan_fines' AND policyname = 'policy_loan_fines_komting_select'
  ) THEN
    CREATE POLICY policy_loan_fines_komting_select
      ON public.loan_fines
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.loans l
          WHERE l.id = loan_fines.loan_id
            AND l.komting_id = public.current_app_user_id()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'loan_fines' AND policyname = 'policy_loan_fines_staff_select'
  ) THEN
    CREATE POLICY policy_loan_fines_staff_select
      ON public.loan_fines
      FOR SELECT
      TO authenticated
      USING (
        public.current_app_user_role() IN ('STAFF', 'ADMIN')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'loan_fines' AND policyname = 'policy_loan_fines_staff_write'
  ) THEN
    CREATE POLICY policy_loan_fines_staff_write
      ON public.loan_fines
      FOR ALL
      TO authenticated
      USING (
        public.current_app_user_role() IN ('STAFF', 'ADMIN')
      )
      WITH CHECK (
        public.current_app_user_role() IN ('STAFF', 'ADMIN')
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loan_fines TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Atomic Return Confirmation RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_staff_confirm_return(
  p_loan_id UUID,
  p_staff_user_id UUID,
  p_qr_payload_hash TEXT,
  p_returned_by TEXT,
  p_representative_name TEXT DEFAULT NULL,
  p_projector_condition TEXT DEFAULT 'NORMAL',
  p_accessories_condition TEXT DEFAULT 'COMPLETE',
  p_unit_disposition TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_evidence_photo_storage_key TEXT DEFAULT NULL,
  p_fine_amount NUMERIC DEFAULT 0.00,
  p_fine_notes TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT 'req_internal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff public.users%ROWTYPE;
  v_komting_user public.users%ROWTYPE;
  v_loan public.loans%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_proj public.projectors%ROWTYPE;
  v_qr public.qr_tokens%ROWTYPE;
  v_inspection public.return_inspections%ROWTYPE;
  v_fine public.loan_fines%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_clean_qr_hash TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_qr_payload_hash, '')), '');
  v_clean_rep_name TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_representative_name, '')), '');
  v_clean_note TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '');
  v_clean_evidence_key TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_evidence_photo_storage_key, '')), '');
  v_clean_fine_notes TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_fine_notes, '')), '');
  v_target_disposition TEXT;
  v_is_overdue BOOLEAN := FALSE;
  v_calc_overdue_minutes INTEGER := 0;
  v_fine_type TEXT := 'NONE';
  v_clean_disposition TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_unit_disposition, '')), '');
BEGIN
  -- 1. Basic Parameter Validation
  IF p_loan_id IS NULL OR p_staff_user_id IS NULL OR p_returned_by IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  -- QR payload hash is strictly required
  IF v_clean_qr_hash IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_PAYLOAD_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_returned_by NOT IN ('KOMTING', 'REPRESENTATIVE') THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  IF p_returned_by = 'REPRESENTATIVE' AND v_clean_rep_name IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:REPRESENTATIVE_NAME_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_projector_condition NOT IN ('NORMAL', 'DAMAGED') THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  IF p_accessories_condition NOT IN ('COMPLETE', 'INCOMPLETE') THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Projector Disposition Resolution
  IF v_clean_disposition IS NULL THEN
    IF p_projector_condition = 'DAMAGED' OR p_accessories_condition = 'INCOMPLETE' THEN
      v_target_disposition := 'MAINTENANCE';
    ELSE
      v_target_disposition := 'AVAILABLE';
    END IF;
  ELSE
    v_target_disposition := v_clean_disposition;
  END IF;

  IF v_target_disposition NOT IN ('AVAILABLE', 'MAINTENANCE') THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  -- Business Rule: Damaged or incomplete unit CANNOT be set as AVAILABLE
  IF (p_projector_condition = 'DAMAGED' OR p_accessories_condition = 'INCOMPLETE') AND v_target_disposition = 'AVAILABLE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:INVALID_DISPOSITION_FOR_DAMAGED_UNIT' USING ERRCODE = 'P0001';
  END IF;

  -- Evidence photo requirement check
  IF (p_projector_condition = 'DAMAGED' OR p_accessories_condition = 'INCOMPLETE') AND v_clean_evidence_key IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:EVIDENCE_PHOTO_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate Staff Actor
  SELECT * INTO v_staff
  FROM public.users u
  WHERE u.id = p_staff_user_id;

  IF NOT FOUND OR v_staff.role NOT IN ('STAFF', 'ADMIN') OR v_staff.account_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock Loan
  SELECT * INTO v_loan
  FROM public.loans l
  WHERE l.id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:LOAN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_loan.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'PINJAM_ERR:LOAN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Lock Related Booking & Projector
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = v_loan.booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_proj
  FROM public.projectors p
  WHERE p.id = v_loan.projector_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:PROJECTOR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 6. Lock and Validate Return QR Token
  SELECT * INTO v_qr
  FROM public.qr_tokens qt
  WHERE qt.booking_id = v_booking.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Defensive against NULL or hash mismatch
  IF v_qr.token_hash IS NULL OR v_qr.token_hash <> v_clean_qr_hash THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_PAYLOAD_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  -- Defensive against revoked or expired QR token (consistent with BE-4)
  IF v_qr.revoked_at IS NOT NULL OR v_qr.expires_at IS NULL OR v_now > v_qr.expires_at THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Defensive against NULL or invalid action scope
  IF v_qr.scope IS NULL OR v_qr.scope NOT IN ('RETURN', 'PICKUP_AND_RETURN') THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_ACTION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_qr.pickup_used_at IS NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_NOT_USED_FOR_PICKUP' USING ERRCODE = 'P0001';
  END IF;

  IF v_qr.return_used_at IS NOT NULL THEN
    RAISE EXCEPTION 'PINJAM_ERR:QR_ALREADY_USED' USING ERRCODE = 'P0001';
  END IF;

  -- 7. Invariant: One inspection and one fine per loan
  IF EXISTS (SELECT 1 FROM public.return_inspections ri WHERE ri.loan_id = v_loan.id) THEN
    RAISE EXCEPTION 'PINJAM_ERR:INSPECTION_ALREADY_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.loan_fines lf WHERE lf.loan_id = v_loan.id) THEN
    RAISE EXCEPTION 'PINJAM_ERR:FINE_ALREADY_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  -- 8. Calculate Overdue Duration & Determine Fine Assessment
  IF v_now > v_booking.estimated_return_at THEN
    v_is_overdue := TRUE;
    v_calc_overdue_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_booking.estimated_return_at)) / 60)::integer);
  ELSE
    v_is_overdue := FALSE;
    v_calc_overdue_minutes := 0;
  END IF;

  IF p_projector_condition = 'DAMAGED' THEN
    v_fine_type := 'DAMAGE';
  ELSIF p_accessories_condition = 'INCOMPLETE' THEN
    v_fine_type := 'LOSS';
  ELSIF v_is_overdue THEN
    v_fine_type := 'LATE_RETURN';
  ELSE
    v_fine_type := 'NONE';
  END IF;

  -- Fine amount validation
  IF COALESCE(p_fine_amount, 0.00) < 0 THEN
    RAISE EXCEPTION 'PINJAM_ERR:FINE_AMOUNT_NEGATIVE' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(p_fine_amount, 0.00) > 0 THEN
    IF v_fine_type NOT IN ('DAMAGE', 'LOSS') THEN
      RAISE EXCEPTION 'PINJAM_ERR:MANUAL_FINE_NOT_ALLOWED' USING ERRCODE = 'P0001';
    END IF;

    IF v_clean_fine_notes IS NULL THEN
      RAISE EXCEPTION 'PINJAM_ERR:FINE_NOTES_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 9. Atomically Update Loan to RETURNED
  UPDATE public.loans
  SET status = 'RETURNED',
      returned_at = v_now,
      return_processed_by = p_staff_user_id,
      return_received_by = p_returned_by,
      return_representative_name = v_clean_rep_name
  WHERE id = v_loan.id
  RETURNING * INTO v_loan;

  -- 10. Atomically Update Projector Physical Status
  UPDATE public.projectors
  SET physical_status = v_target_disposition
  WHERE id = v_proj.id
  RETURNING * INTO v_proj;

  -- 11. Mark QR Token return_used_at
  UPDATE public.qr_tokens
  SET return_used_at = v_now,
      loan_id = COALESCE(loan_id, v_loan.id)
  WHERE id = v_qr.id;

  -- 12. Insert Return Inspection Record
  INSERT INTO public.return_inspections (
    loan_id,
    projector_condition,
    accessories_condition,
    note,
    evidence_photo_storage_key,
    unit_disposition,
    inspected_by,
    inspected_at
  ) VALUES (
    v_loan.id,
    p_projector_condition,
    p_accessories_condition,
    v_clean_note,
    v_clean_evidence_key,
    v_target_disposition,
    p_staff_user_id,
    v_now
  )
  RETURNING * INTO v_inspection;

  -- 13. If disposition is MAINTENANCE, create maintenance record (prevent duplicates)
  IF v_target_disposition = 'MAINTENANCE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.maintenance_records mr
      WHERE mr.projector_id = v_proj.id
        AND mr.status = 'IN_PROGRESS'
    ) THEN
      INSERT INTO public.maintenance_records (
        projector_id,
        reason,
        note,
        status,
        created_by,
        started_at
      ) VALUES (
        v_proj.id,
        'Pemeriksaan pengembalian unit ' || v_proj.asset_code || ': ' ||
        CASE WHEN p_projector_condition = 'DAMAGED' THEN 'Unit rusak. ' ELSE '' END ||
        CASE WHEN p_accessories_condition = 'INCOMPLETE' THEN 'Aksesori tidak lengkap. ' ELSE '' END ||
        COALESCE(v_clean_note, ''),
        v_clean_note,
        'IN_PROGRESS',
        p_staff_user_id,
        v_now
      );
    END IF;
  END IF;

  -- 14. Record Fine Details
  INSERT INTO public.loan_fines (
    loan_id,
    fine_type,
    amount,
    overdue_minutes,
    status,
    calculation_details,
    notes
  ) VALUES (
    v_loan.id,
    v_fine_type,
    COALESCE(p_fine_amount, 0.00),
    v_calc_overdue_minutes,
    CASE WHEN COALESCE(p_fine_amount, 0.00) > 0 THEN 'PENDING' ELSE 'EXEMPT' END,
    pg_catalog.jsonb_build_object(
      'is_overdue', v_is_overdue,
      'overdue_minutes', v_calc_overdue_minutes,
      'estimated_return_at', v_booking.estimated_return_at,
      'returned_at', v_now,
      'projector_condition', p_projector_condition,
      'accessories_condition', p_accessories_condition,
      'fine_policy', 'PRD_INITIAL_RELEASE_NO_AUTO_FINES'
    ),
    v_clean_fine_notes
  )
  RETURNING * INTO v_fine;

  -- 15. Write Audit Logs (Append-Only)
  -- A. Loan Return Confirmed
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    actor_source,
    action,
    entity_type,
    entity_id,
    after_data,
    request_id
  ) VALUES (
    p_staff_user_id,
    v_staff.role,
    'API',
    'LOAN_RETURN_CONFIRMED',
    'LOAN',
    v_loan.id::text,
    pg_catalog.jsonb_build_object(
      'loan_id', v_loan.id,
      'booking_id', v_booking.id,
      'projector_id', v_proj.id,
      'returned_at', v_now,
      'returned_by', p_returned_by,
      'unit_disposition', v_target_disposition
    ),
    p_request_id
  );

  -- B. Loan Inspected
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    actor_source,
    action,
    entity_type,
    entity_id,
    after_data,
    request_id
  ) VALUES (
    p_staff_user_id,
    v_staff.role,
    'API',
    'LOAN_INSPECTED',
    'RETURN_INSPECTION',
    v_inspection.id::text,
    pg_catalog.jsonb_build_object(
      'loan_id', v_loan.id,
      'projector_condition', p_projector_condition,
      'accessories_condition', p_accessories_condition,
      'unit_disposition', v_target_disposition,
      'has_evidence_photo', v_clean_evidence_key IS NOT NULL
    ),
    p_request_id
  );

  -- C. Loan Fine Recorded
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    actor_source,
    action,
    entity_type,
    entity_id,
    after_data,
    request_id
  ) VALUES (
    p_staff_user_id,
    v_staff.role,
    'API',
    'LOAN_FINE_RECORDED',
    'LOAN',
    v_loan.id::text,
    pg_catalog.jsonb_build_object(
      'loan_id', v_loan.id,
      'fine_id', v_fine.id,
      'fine_type', v_fine.fine_type,
      'amount', v_fine.amount,
      'overdue_minutes', v_fine.overdue_minutes,
      'status', v_fine.status
    ),
    p_request_id
  );

  -- 16. Queue Transactional Email Notification in Outbox
  SELECT * INTO v_komting_user
  FROM public.users u
  WHERE u.id = v_loan.komting_id;

  INSERT INTO public.email_outbox (
    event_type,
    recipient,
    payload,
    deduplication_key
  ) VALUES (
    'LOAN_RETURNED',
    v_komting_user.email,
    pg_catalog.jsonb_build_object(
      'subject', 'Pengembalian Proyektor Berhasil — ' || v_booking.booking_code,
      'loan_id', v_loan.id,
      'booking_code', v_booking.booking_code,
      'projector_name', v_proj.name,
      'returned_at', v_now,
      'unit_disposition', v_target_disposition,
      'is_overdue', v_is_overdue,
      'overdue_minutes', v_calc_overdue_minutes
    ),
    'loan_returned:' || v_loan.id::text
  )
  ON CONFLICT (deduplication_key) DO NOTHING;

  -- 17. Return Structured Result
  RETURN pg_catalog.jsonb_build_object(
    'loan', pg_catalog.jsonb_build_object(
      'id', v_loan.id,
      'status', v_loan.status,
      'returned_at', v_loan.returned_at
    ),
    'inspection', pg_catalog.jsonb_build_object(
      'id', v_inspection.id,
      'projector_condition', v_inspection.projector_condition,
      'accessories_condition', v_inspection.accessories_condition,
      'unit_disposition', v_inspection.unit_disposition,
      'evidence_photo_storage_key', v_inspection.evidence_photo_storage_key,
      'inspected_at', v_inspection.inspected_at
    ),
    'projector', pg_catalog.jsonb_build_object(
      'id', v_proj.id,
      'physical_status', v_proj.physical_status
    ),
    'fine', pg_catalog.jsonb_build_object(
      'id', v_fine.id,
      'fine_type', v_fine.fine_type,
      'amount', v_fine.amount,
      'overdue_minutes', v_fine.overdue_minutes,
      'status', v_fine.status
    )
  );
END;
$$;

-- Revoke execute from public/anon/authenticated and grant strictly to service_role
REVOKE ALL ON FUNCTION public.rpc_staff_confirm_return(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rpc_staff_confirm_return(
      UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
    ) TO service_role;
  END IF;
END $$;

COMMIT;
