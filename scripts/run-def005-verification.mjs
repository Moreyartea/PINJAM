import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  function record(title, passed, details) {
    console.log(`[${passed ? "PASS" : "FAIL"}] ${title}`);
    results.tests.push({ title, passed, details });
  }

  // Helper to obtain staff token
  const { data: staffLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "conc-staff@example.test",
  });
  const { data: staffAuth } = await anon.auth.verifyOtp({
    token_hash: staffLink.properties.hashed_token,
    type: "magiclink",
  });
  const staffToken = staffAuth.session.access_token;
  const staffUserId = staffAuth.session.user.id;

  // Helper to obtain komting token
  const { data: komtingLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "conc-komting2@example.test",
  });
  const { data: komtingAuth } = await anon.auth.verifyOtp({
    token_hash: komtingLink.properties.hashed_token,
    type: "magiclink",
  });
  const komtingToken = komtingAuth.session.access_token;

  console.log("Tokens acquired. Staff User ID:", staffUserId);

  const testProjectorId = "7f62dc73-11b8-4d2a-afb3-e0132976df92"; // BE5-MAFPKE-AUDIT

  // Pre-condition: Check initial projector state
  const { data: initialProj } = await admin.from("projectors").select("*").eq("id", testProjectorId).single();
  console.log("Initial projector status:", initialProj.physical_status, "is_active:", initialProj.is_active);

  if (initialProj.physical_status !== "AVAILABLE") {
    throw new Error(`Test projector is not AVAILABLE (currently: ${initialProj.physical_status})`);
  }

  // --- SECTION B: MAINTENANCE WORKFLOW TESTING ---

  // B.1 Negative: Unauthenticated & Komting access to start maintenance
  const resUnauthStart = await fetch(`http://localhost:3000/api/v1/staff/projectors/${testProjectorId}/maintenance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Pembersihan lensa rutin" })
  });
  record("B.1.1 Unauthenticated start maintenance rejected with 401", resUnauthStart.status === 401, {
    status: resUnauthStart.status,
    body: await resUnauthStart.json()
  });

  const resKomtingStart = await fetch(`http://localhost:3000/api/v1/staff/projectors/${testProjectorId}/maintenance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${komtingToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason: "Pembersihan lensa rutin" })
  });
  record("B.1.2 Komting start maintenance rejected with 403", resKomtingStart.status === 403, {
    status: resKomtingStart.status,
    body: await resKomtingStart.json()
  });

  // B.2 Negative: Invalid inputs on start maintenance
  const resShortReason = await fetch(`http://localhost:3000/api/v1/staff/projectors/${testProjectorId}/maintenance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason: "fix" })
  });
  record("B.2.1 Reason < 5 chars rejected with 422", resShortReason.status === 422, {
    status: resShortReason.status,
    body: await resShortReason.json()
  });

  const resInvalidProjUuid = await fetch(`http://localhost:3000/api/v1/staff/projectors/not-a-uuid/maintenance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason: "Pembersihan lensa rutin" })
  });
  record("B.2.2 Invalid UUID projectorId rejected with 400", resInvalidProjUuid.status === 400, {
    status: resInvalidProjUuid.status,
    body: await resInvalidProjUuid.json()
  });

  // B.3 Positive: STAFF starts maintenance with valid reason
  const validReason = "Pembersihan lensa dan penggantian filter debu berkala UAT";
  const validNote = "Unit dibawa ke ruang bengkel teknisi lab";
  const resStartSuccess = await fetch(`http://localhost:3000/api/v1/staff/projectors/${testProjectorId}/maintenance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason: validReason, note: validNote })
  });
  const startData = await resStartSuccess.json();
  const createdMaintRecord = startData.data;

  record("B.3.1 STAFF starts maintenance returns 201 Created", resStartSuccess.status === 201 && createdMaintRecord?.status === "IN_PROGRESS", {
    status: resStartSuccess.status,
    data: createdMaintRecord
  });

  // B.4 Database Verification: 1 record created, projector is MAINTENANCE, audit log recorded
  const { data: dbMaintRecord } = await admin.from("maintenance_records").select("*").eq("id", createdMaintRecord.id).single();
  const { data: dbProjAfterStart } = await admin.from("projectors").select("*").eq("id", testProjectorId).single();
  const { data: dbAuditStart } = await admin.from("audit_logs")
    .select("*")
    .eq("entity_id", testProjectorId)
    .eq("action", "PROJECTOR_MAINTENANCE")
    .order("created_at", { ascending: false })
    .limit(1);

  record("B.4.1 Database maintenance_record exists with status IN_PROGRESS", dbMaintRecord?.status === "IN_PROGRESS" && dbMaintRecord?.reason === validReason, {
    record: dbMaintRecord
  });
  record("B.4.2 Projector physical_status transitioned to MAINTENANCE", dbProjAfterStart?.physical_status === "MAINTENANCE", {
    physical_status: dbProjAfterStart?.physical_status
  });
  record("B.4.3 Audit log recorded for PROJECTOR_MAINTENANCE", dbAuditStart?.length > 0 && dbAuditStart[0].actor_role === "STAFF", {
    auditLog: dbAuditStart?.[0]
  });

  // B.5 Negative: Duplicate active maintenance on the same unit
  const resDuplicateMaint = await fetch(`http://localhost:3000/api/v1/staff/projectors/${testProjectorId}/maintenance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason: "Mencoba mulai maintenance kedua pada unit yang sama" })
  });
  record("B.5.1 Duplicate maintenance rejected with 409 MAINTENANCE_ALREADY_ACTIVE", resDuplicateMaint.status === 409, {
    status: resDuplicateMaint.status,
    body: await resDuplicateMaint.json()
  });

  // B.6 Negative: Unauthenticated & Komting access to complete maintenance
  const resUnauthComplete = await fetch(`http://localhost:3000/api/v1/staff/maintenance/${createdMaintRecord.id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolution_note: "Selesai dibersihkan" })
  });
  record("B.6.1 Unauthenticated complete maintenance rejected with 401", resUnauthComplete.status === 401, {
    status: resUnauthComplete.status,
    body: await resUnauthComplete.json()
  });

  const resKomtingComplete = await fetch(`http://localhost:3000/api/v1/staff/maintenance/${createdMaintRecord.id}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${komtingToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ resolution_note: "Selesai dibersihkan" })
  });
  record("B.6.2 Komting complete maintenance rejected with 403", resKomtingComplete.status === 403, {
    status: resKomtingComplete.status,
    body: await resKomtingComplete.json()
  });

  // B.7 Negative: Invalid input on complete maintenance
  const resEmptyResolution = await fetch(`http://localhost:3000/api/v1/staff/maintenance/${createdMaintRecord.id}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ resolution_note: "   " })
  });
  record("B.7.1 Empty resolution_note rejected with 422", resEmptyResolution.status === 422, {
    status: resEmptyResolution.status,
    body: await resEmptyResolution.json()
  });

  // B.8 Positive: STAFF completes maintenance with valid resolution
  const validResolution = "Lensa telah dibersihkan, filter baru terpasang, unit telah lulus uji operasional.";
  const resCompleteSuccess = await fetch(`http://localhost:3000/api/v1/staff/maintenance/${createdMaintRecord.id}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      resolution_note: validResolution,
      set_projector_available: true
    })
  });
  const completeData = await resCompleteSuccess.json();
  const completedMaintRecord = completeData.data;

  record("B.8.1 STAFF completes maintenance returns 200 OK", resCompleteSuccess.status === 200 && completedMaintRecord?.status === "COMPLETED", {
    status: resCompleteSuccess.status,
    data: completedMaintRecord
  });

  // B.9 Database Verification: record COMPLETED, projector is AVAILABLE, audit log recorded
  const { data: dbMaintRecordDone } = await admin.from("maintenance_records").select("*").eq("id", createdMaintRecord.id).single();
  const { data: dbProjAfterComplete } = await admin.from("projectors").select("*").eq("id", testProjectorId).single();
  const { data: dbAuditComplete } = await admin.from("audit_logs")
    .select("*")
    .eq("entity_id", createdMaintRecord.id)
    .eq("action", "MAINTENANCE_COMPLETED")
    .order("created_at", { ascending: false })
    .limit(1);

  record("B.9.1 Database maintenance_record status is COMPLETED with completed_at and completed_by",
    dbMaintRecordDone?.status === "COMPLETED" && dbMaintRecordDone?.completed_at !== null && dbMaintRecordDone?.completed_by !== null, {
      record: dbMaintRecordDone
    }
  );
  record("B.9.2 Projector physical_status returned to AVAILABLE", dbProjAfterComplete?.physical_status === "AVAILABLE", {
    physical_status: dbProjAfterComplete?.physical_status
  });
  record("B.9.3 Audit log recorded for MAINTENANCE_COMPLETED", dbAuditComplete?.length > 0 && dbAuditComplete[0].actor_role === "STAFF", {
    auditLog: dbAuditComplete?.[0]
  });

  // B.10 Negative: Completing an already COMPLETED maintenance record
  const resCompleteAgain = await fetch(`http://localhost:3000/api/v1/staff/maintenance/${createdMaintRecord.id}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      resolution_note: "Mencoba menyelesaikan lagi",
      set_projector_available: true
    })
  });
  record("B.10.1 Completing already COMPLETED record rejected with 409", resCompleteAgain.status === 409, {
    status: resCompleteAgain.status,
    body: await resCompleteAgain.json()
  });

  const outPath = "/Users/user/.gemini/antigravity/brain/0dd2929d-ed36-46db-8669-2f8e46dc86d8/scratch/def005-verification-results.json";
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log("Full verification data written to:", outPath);
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
