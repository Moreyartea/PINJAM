import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const DOMAIN_TS_PATH = path.join(ROOT, "src", "types", "domain.ts");
const VERIFY_SQL_PATH = path.join(ROOT, "supabase", "tests", "verify-database-foundation.sql");

function extractUnionLiterals(source, typeName) {
  const regex = new RegExp(`export type ${typeName}\\s*=([\\s\\S]*?);`);
  const match = source.match(regex);
  assert.ok(match, `Missing type ${typeName} in src/types/domain.ts`);
  return [...match[1].matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]);
}

function checkBalancedDelimiters(sql, fileName) {
  let depth = 0;
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (inSingleQuote) {
      if (ch === "'" && next === "'") {
        i += 1;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }
    if (ch === "$") {
      const rest = sql.slice(i);
      const tagMatch = rest.match(/^\$[A-Za-z0-9_]*\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      assert.ok(depth >= 0, `Unmatched ')' in ${fileName} at offset ${i}`);
    }
  }

  assert.equal(inSingleQuote, false, `Unclosed string literal in ${fileName}`);
  assert.equal(inBlockComment, false, `Unclosed block comment in ${fileName}`);
  assert.equal(dollarTag, null, `Unclosed dollar-quoted block in ${fileName}`);
  assert.equal(depth, 0, `Unbalanced parentheses in ${fileName} (depth=${depth})`);
}

function main() {
  assert.ok(fs.existsSync(MIGRATIONS_DIR), "supabase/migrations directory must exist");
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  assert.equal(files.length, 17, `Expected 17 ordered migrations, found ${files.length}`);

  const prefixes = files.map((f) => {
    const match = f.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
    assert.ok(match, `Invalid Supabase migration filename format: ${f}`);
    return match[1];
  });

  const sortedPrefixes = [...prefixes].sort();
  assert.deepEqual(prefixes, sortedPrefixes, "Migrations must be strictly ordered");
  assert.equal(new Set(prefixes).size, prefixes.length, "Migration timestamps must be unique");

  const combinedSql = files
    .map((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      checkBalancedDelimiters(sql, file);
      assert.match(sql, /\bBEGIN;/, `${file} must start a transaction`);
      assert.match(sql, /\bCOMMIT;/, `${file} must commit its transaction`);
      assert.doesNotMatch(
        sql,
        /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i,
        `${file} must not contain destructive SQL statements`
      );
      assert.doesNotMatch(
        sql,
        /(service_role_key|eyJ[A-Za-z0-9_-]{10,})/i,
        `${file} must not contain secrets or keys`
      );
      return sql;
    })
    .join("\n");

  const expectedTables = [
    "users",
    "komting_applications",
    "komting_assignments",
    "projectors",
    "operating_hours",
    "bookings",
    "loans",
    "return_inspections",
    "maintenance_records",
    "qr_tokens",
    "email_outbox",
    "audit_logs",
    "idempotency_records",
  ];

  for (const table of expectedTables) {
    assert.match(
      combinedSql,
      new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`),
      `Missing table creation for public.${table}`
    );
    assert.match(
      combinedSql,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`),
      `Missing RLS enablement for public.${table}`
    );
  }

  // Verify alignment between frontend domain enums and SQL CHECK constraints
  const domainTs = fs.readFileSync(DOMAIN_TS_PATH, "utf8");
  const enumChecks = [
    ["UserRole", "chk_users_role"],
    ["AccountStatus", "chk_users_account_status"],
    ["ApplicationStatus", "chk_komting_applications_status"],
    ["AssignmentStatus", "chk_komting_assignments_status"],
    ["ProjectorPhysicalStatus", "chk_projectors_physical_status"],
    ["BookingStatus", "chk_bookings_status"],
    ["LoanStatus", "chk_loans_status"],
    ["ProjectorCondition", "chk_return_inspections_projector_condition"],
    ["AccessoriesCondition", "chk_return_inspections_accessories_condition"],
    ["UnitDisposition", "chk_return_inspections_unit_disposition"],
    ["MaintenanceStatus", "chk_maintenance_records_status"],
  ];

  for (const [tsType, constraintName] of enumChecks) {
    const values = extractUnionLiterals(domainTs, tsType);
    const constraintRegex = new RegExp(`CONSTRAINT ${constraintName} CHECK \\(([\\s\\S]*?)\\)`);
    const match = combinedSql.match(constraintRegex);
    assert.ok(match, `Missing CHECK constraint ${constraintName}`);
    for (const val of values) {
      assert.ok(
        match[1].includes(`'${val}'`),
        `Constraint ${constraintName} is missing enum value '${val}' from ${tsType}`
      );
    }
  }

  // Verify critical database invariants & remediations exist
  const requiredInvariants = [
    "uq_users_email_lower",
    "uq_komting_applications_active_per_user",
    "chk_komting_applications_review_consistency",
    "uq_komting_assignments_active_class",
    "uq_komting_assignments_active_user",
    "chk_komting_assignments_ended_by_consistency",
    "uq_projectors_asset_code_lower",
    "chk_projectors_active_status_consistency",
    "excl_bookings_no_overlap_per_projector",
    "uq_bookings_active_per_komting",
    "uq_bookings_id_projector_komting",
    "fk_loans_booking_identity",
    "uq_loans_id_booking",
    "uq_loans_active_per_komting",
    "uq_loans_active_per_projector",
    "chk_loans_return_received_consistency",
    "trg_loans_immutability_guard",
    "trg_loans_verify_cross_table_consistency",
    "trg_bookings_verify_status_against_loans",
    "trg_projectors_verify_status_consistency",
    "chk_return_inspections_evidence_required",
    "trg_return_inspections_immutability_guard",
    "trg_return_inspections_verify_loan_returned",
    "uq_maintenance_records_active_per_projector",
    "trg_maintenance_records_history_guard",
    "trg_maintenance_verify_projector_status",
    "fk_qr_tokens_loan_matches_booking",
    "trg_qr_tokens_insert_guard",
    "trg_qr_tokens_lifecycle_guard",
    "trg_audit_logs_append_only",
    "trg_audit_logs_prevent_truncate",
    "chk_audit_logs_actor_source_role",
    "uq_idempotency_records_scope",
    "chk_idempotency_status_consistency",
    "trg_idempotency_records_set_updated_at",
    "projector_lifecycle_seq",
    "trg_loans_bump_lifecycle_seq",
    "trg_return_inspections_bump_lifecycle_seq",
    "trg_maintenance_records_bump_lifecycle_seq",
  ];

  for (const symbol of requiredInvariants) {
    assert.match(
      combinedSql,
      new RegExp(`\\b${symbol}\\b`),
      `Missing required constraint/index/trigger: ${symbol}`
    );
  }

  // Verify security hardening in 007, live-lookup in 009, and FOUND/clock/seq fixes in 010
  const migration007 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000007_remediate_integrity_and_security.sql"),
    "utf8"
  );
  const migration009 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000009_fix_deferred_triggers_and_qr_security.sql"),
    "utf8"
  );
  const migration010 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000010_fix_sql_trigger_and_qr_clock.sql"),
    "utf8"
  );
  assert.match(
    migration007,
    /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;/
  );
  assert.match(
    migration007,
    /ALTER DEFAULT PRIVILEGES IN SCHEMA public\s+REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;/
  );
  assert.match(migration007, /SET search_path = ''/);
  assert.doesNotMatch(migration007, /GRANT SELECT ON[\s\S]*\bqr_tokens\b/);
  assert.doesNotMatch(migration007, /GRANT SELECT ON[\s\S]*\bemail_outbox\b/);
  assert.doesNotMatch(migration007, /GRANT SELECT ON[\s\S]*\bidempotency_records\b/);

  for (const fnCheck of [
    /FROM public\.bookings b\s+WHERE b\.id = v_target_id/,
    /FROM public\.loans l\s+WHERE l\.id = v_target_id/,
    /FROM public\.projectors p\s+WHERE p\.id = v_target_id/,
    /FROM public\.return_inspections ri\s+WHERE ri\.id = v_target_id/,
    /FROM public\.maintenance_records m\s+WHERE m\.id = v_target_id/,
  ]) {
    assert.match(migration009, fnCheck, `Migration 009 missing live state lookup: ${fnCheck}`);
  }

  assert.match(migration010, /v_projector_exists := FOUND;/);
  assert.match(migration010, /IF NOT v_projector_exists THEN/);
  assert.match(migration010, /pg_catalog\.clock_timestamp\(\)/);
  assert.doesNotMatch(migration010, /v_now\s+TIMESTAMPTZ\s*:=\s*pg_catalog\.now\(\)/);
  assert.match(
    migration010,
    /REVOKE ALL ON SEQUENCE public\.projector_lifecycle_seq FROM PUBLIC, anon, authenticated;/
  );

  const migration011 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000011_grant_service_role_privileges.sql"),
    "utf8"
  );
  assert.match(migration011, /GRANT SELECT, INSERT ON TABLE public\.audit_logs TO service_role;/);
  assert.match(migration011, /GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;/);
  const migration011NoComments = migration011.replace(/--.*$/gm, "");
  assert.doesNotMatch(migration011NoComments, /\bTO\s+(PUBLIC|anon|authenticated)\b/i);

  const migration012 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000012_komting_atomic_workflows.sql"),
    "utf8"
  );
  assert.match(migration012, /rpc_admin_approve_komting_application/);
  assert.match(migration012, /rpc_admin_reject_komting_application/);
  assert.match(migration012, /rpc_admin_approve_komting_replacement/);
  assert.match(migration012, /rpc_admin_deactivate_komting_assignment/);
  const migration012NoComments = migration012.replace(/--.*$/gm, "");
  assert.doesNotMatch(
    migration012NoComments,
    /GRANT\s+EXECUTE[\s\S]*?\bTO\s+(PUBLIC|anon|authenticated)\b/i
  );

  const migration013 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000013_be3_operating_hours_and_projector_workflows.sql"),
    "utf8"
  );
  assert.match(migration013, /rpc_admin_upsert_operating_hours/);
  assert.match(migration013, /rpc_admin_deactivate_projector/);
  const migration013NoComments = migration013.replace(/--.*$/gm, "");
  assert.doesNotMatch(
    migration013NoComments,
    /GRANT\s+EXECUTE[\s\S]*?\bTO\s+(PUBLIC|anon|authenticated)\b/i
  );

  const migration014 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000014_be4_booking_and_pickup_atomic_workflows.sql"),
    "utf8"
  );
  assert.match(migration014, /rpc_komting_create_booking/);
  assert.match(migration014, /rpc_komting_cancel_booking/);
  assert.match(migration014, /rpc_staff_confirm_pickup/);
  const migration014NoComments = migration014.replace(/--.*$/gm, "");
  assert.doesNotMatch(
    migration014NoComments,
    /GRANT\s+EXECUTE[\s\S]*?\bTO\s+(PUBLIC|anon|authenticated)\b/i
  );

  const migration015 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000015_be4_loan_pickup_audit_action_fix.sql"),
    "utf8"
  );
  assert.match(migration015, /rpc_staff_confirm_pickup/);
  assert.match(migration015, /LOAN_PICKUP_CONFIRMED/);
  const migration015NoComments = migration015.replace(/--.*$/gm, "");
  assert.doesNotMatch(
    migration015NoComments,
    /GRANT\s+EXECUTE[\s\S]*?\bTO\s+(PUBLIC|anon|authenticated)\b/i
  );

  const migration016 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000016_be5_loan_return_inspection_and_fines.sql"),
    "utf8"
  );
  assert.match(migration016, /rpc_staff_confirm_return/);
  assert.match(migration016, /LOAN_RETURN_CONFIRMED/);
  assert.match(migration016, /public\.loan_fines/);
  const migration016NoComments = migration016.replace(/--.*$/gm, "");
  assert.doesNotMatch(
    migration016NoComments,
    /GRANT\s+EXECUTE[\s\S]*?\bTO\s+(PUBLIC|anon|authenticated)\b/i
  );

  const migration017 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20261126000017_be6_email_outbox_processor_and_batch_claiming.sql"),
    "utf8"
  );
  assert.match(migration017, /rpc_claim_email_outbox_batch/);
  assert.match(migration017, /FOR UPDATE SKIP LOCKED/i);
  const migration017NoComments = migration017.replace(/--.*$/gm, "");
  assert.doesNotMatch(
    migration017NoComments,
    /GRANT\s+EXECUTE[\s\S]*?\bTO\s+(PUBLIC|anon|authenticated)\b/i
  );

  // Verify verify-database-foundation.sql restores DEFERRED mode and tests STAFF loans/maintenance
  const verifySql = fs.readFileSync(VERIFY_SQL_PATH, "utf8");
  checkBalancedDelimiters(verifySql, "verify-database-foundation.sql");
  assert.match(verifySql, /GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;/);
  assert.match(verifySql, /SET CONSTRAINTS ALL IMMEDIATE;\s+SET CONSTRAINTS ALL DEFERRED;/);
  assert.match(verifySql, /RLS STAFF expected operational loans visibility/);
  assert.match(verifySql, /RLS STAFF expected operational maintenance_records visibility/);

  console.log(
    `OK: Validated ${files.length} migrations, ${expectedTables.length} tables with RLS, ${enumChecks.length} enum alignments, ${requiredInvariants.length} invariants, FOUND fix, clock_timestamp(), and causal lifecycle_seq.`
  );
}

main();
