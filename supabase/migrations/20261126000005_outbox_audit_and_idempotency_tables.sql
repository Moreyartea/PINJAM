-- ============================================================================
-- Migration 005: Email Outbox, Audit Logs & Idempotency Records
-- ============================================================================
-- Purpose:
--   Creates transactional outbox, append-only audit trail, and idempotency
--   tables supporting reliable async email delivery, compliance auditing, and
--   safe mutation retries.
--
-- Tables:
--   - public.email_outbox
--   - public.audit_logs
--   - public.idempotency_records
--
-- Key Invariants Enforced:
--   - Unique deduplication_key on email_outbox prevents duplicate email events.
--   - audit_logs is append-only (BEFORE UPDATE OR DELETE trigger blocks edits).
--   - System jobs record actor_role = 'SYSTEM' and actor_source = 'SYSTEM_JOB'
--     with actor_user_id IS NULL instead of impersonating an ADMIN user.
--   - Unique idempotency scope across (actor_user_id / SYSTEM, route, key).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. public.email_outbox
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  deduplication_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_email_outbox_event_type_non_empty CHECK (btrim(event_type) <> ''),
  CONSTRAINT chk_email_outbox_recipient_non_empty CHECK (btrim(recipient) <> ''),
  CONSTRAINT chk_email_outbox_dedup_key_non_empty CHECK (btrim(deduplication_key) <> ''),
  CONSTRAINT chk_email_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT chk_email_outbox_status CHECK (
    status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')
  ),
  CONSTRAINT chk_email_outbox_attempt_count CHECK (attempt_count >= 0),
  CONSTRAINT chk_email_outbox_sent_at CHECK (status <> 'SENT' OR sent_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_dispatch_queue
  ON public.email_outbox (next_attempt_at ASC)
  WHERE status IN ('PENDING', 'PROCESSING');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_email_outbox_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_email_outbox_set_updated_at
      BEFORE UPDATE ON public.email_outbox
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. public.audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  actor_source TEXT NOT NULL DEFAULT 'API',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_audit_logs_actor_role CHECK (
    actor_role IN ('KOMTING', 'STAFF', 'ADMIN', 'SYSTEM')
  ),
  CONSTRAINT chk_audit_logs_actor_source CHECK (
    actor_source IN ('API', 'SYSTEM_JOB')
  ),
  CONSTRAINT chk_audit_logs_actor_consistency CHECK (
    (actor_role = 'SYSTEM' AND actor_source = 'SYSTEM_JOB' AND actor_user_id IS NULL)
    OR (actor_role <> 'SYSTEM' AND actor_user_id IS NOT NULL)
  ),
  CONSTRAINT chk_audit_logs_action_non_empty CHECK (btrim(action) <> ''),
  CONSTRAINT chk_audit_logs_entity_type_non_empty CHECK (btrim(entity_type) <> ''),
  CONSTRAINT chk_audit_logs_entity_id_non_empty CHECK (btrim(entity_id) <> ''),
  CONSTRAINT chk_audit_logs_request_id_non_empty CHECK (btrim(request_id) <> '')
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created_at
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at
  ON public.audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id
  ON public.audit_logs (request_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_append_only'
  ) THEN
    CREATE TRIGGER trg_audit_logs_append_only
      BEFORE UPDATE OR DELETE ON public.audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_audit_log_mutation();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. public.idempotency_records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  route_or_operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_idempotency_key_non_empty CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT chk_idempotency_route_non_empty CHECK (btrim(route_or_operation) <> ''),
  CONSTRAINT chk_idempotency_request_hash_non_empty CHECK (btrim(request_hash) <> ''),
  CONSTRAINT chk_idempotency_response_status CHECK (response_status BETWEEN 100 AND 599),
  CONSTRAINT chk_idempotency_expires_after_created CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_records_scope
  ON public.idempotency_records (
    COALESCE(actor_user_id::text, 'SYSTEM'),
    route_or_operation,
    idempotency_key
  );

CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires_at
  ON public.idempotency_records (expires_at);

COMMIT;
