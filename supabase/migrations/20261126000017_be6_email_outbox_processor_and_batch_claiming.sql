-- Migration 017: BE-6 Transactional Email Outbox Batch Claiming and Processing RPC
-- Adds atomic batch claiming RPC for email_outbox with FOR UPDATE SKIP LOCKED
-- to prevent race conditions across concurrent workers.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_email_outbox_queue_processing
  ON public.email_outbox (status, next_attempt_at ASC, created_at ASC)
  WHERE status IN ('PENDING', 'PROCESSING');

CREATE OR REPLACE FUNCTION public.rpc_claim_email_outbox_batch(
  p_batch_size INTEGER DEFAULT 10,
  p_lock_timeout_seconds INTEGER DEFAULT 300
)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_timeout_seconds INTEGER;
  v_timeout_interval INTERVAL;
  v_limit INTEGER;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_batch_size, 10), 100));
  v_timeout_seconds := GREATEST(10, COALESCE(p_lock_timeout_seconds, 300));
  v_timeout_interval := (v_timeout_seconds || ' seconds')::INTERVAL;

  RETURN QUERY
  WITH claimable AS (
    SELECT eo.id
    FROM public.email_outbox eo
    WHERE (
      eo.status = 'PENDING'
      OR (
        eo.status = 'PROCESSING'
        AND (
          eo.locked_at IS NULL
          OR eo.locked_at < (v_now - v_timeout_interval)
        )
      )
    )
    AND eo.next_attempt_at <= v_now
    ORDER BY eo.next_attempt_at ASC, eo.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox target
  SET status = 'PROCESSING',
      locked_at = v_now,
      attempt_count = CASE
        WHEN target.status = 'PENDING' THEN target.attempt_count + 1
        ELSE target.attempt_count
      END,
      updated_at = v_now
  FROM claimable c
  WHERE target.id = c.id
  RETURNING target.*;
END;
$$;

-- Restrict execution to service_role only
REVOKE ALL ON FUNCTION public.rpc_claim_email_outbox_batch(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_email_outbox_batch(INTEGER, INTEGER) TO service_role;

COMMENT ON FUNCTION public.rpc_claim_email_outbox_batch(INTEGER, INTEGER) IS
  'Atomically claims a batch of pending or expired-lease processing outbox items using FOR UPDATE SKIP LOCKED for concurrent worker safety.';

COMMIT;
