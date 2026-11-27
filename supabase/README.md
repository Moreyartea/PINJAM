# PINJAM Database Foundation (`supabase/`)

Dokumentasi ringkas untuk struktur migrasi database PINJAM berdasarkan `PRD_PINJAM_FINAL.md` (v2.0.0), `BACKEND_SPEC_PINJAM.md` (v1.0.0), dan `API_CONTRACT_PINJAM.md` (v1.0.0).

## Urutan Migration

Semua file migration bersifat **non-destruktif**, tidak mengubah histori migration sebelumnya, dan dibungkus transaksi `BEGIN; ... COMMIT;`.

| Urutan | File | Cakupan |
|---|---|---|
| 001 | `20261126000001_extensions_and_shared_functions.sql` | Ekstensi `pgcrypto`, `btree_gist`, fungsi trigger `set_updated_at()`, dan fungsi append-only `prevent_audit_log_mutation()`. |
| 002 | `20261126000002_identity_and_komting_tables.sql` | Tabel `users`, `komting_applications`, `komting_assignments` beserta partial unique indexes untuk mencegah duplikasi aplikasi aktif dan memastikan maksimal 1 komting aktif per kelas dan per mahasiswa. |
| 003 | `20261126000003_inventory_and_operating_hours_tables.sql` | Tabel `projectors` (memisahkan `physical_status` dari status booking/loan) dan `operating_hours` (konfigurasi harian zona `Asia/Jakarta`). |
| 004 | `20261126000004_booking_loan_inspection_maintenance_qr_tables.sql` | Tabel `bookings` (dengan `EXCLUDE USING gist` anti-overlap dan validasi tanggal lokal `Asia/Jakarta`), `loans`, `return_inspections` (wajib bukti foto bila rusak/tidak lengkap), `maintenance_records`, dan `qr_tokens` (opaque hashed token mendukung pickup lalu return tanpa replay). |
| 005 | `20261126000005_outbox_audit_and_idempotency_tables.sql` | Tabel `email_outbox`, `audit_logs` (append-only via trigger + dukungan aktor `SYSTEM`), dan `idempotency_records`. |
| 006 | `20261126000006_enable_rls_and_policies.sql` | Mengaktifkan RLS pada seluruh 13 tabel `public`, mencabut hak tulis langsung untuk `anon`/`authenticated`, serta menerapkan kebijakan `SELECT` least-privilege berbasis `auth.uid()`. |
| 007 | `20261126000007_remediate_integrity_and_security.sql` | Perbaikan integritas relasi (composite FK `loans`↔`bookings` dan `qr_tokens`↔`loans`), anti-replay trigger QR, kelengkapan return + deferred cross-table constraint triggers, konsistensi `projectors.is_active` / `audit_logs` / `idempotency_records` (`IN_PROGRESS`), pencabutan penuh privilege client/default privileges, dan `search_path = ''`. |
| 008 | `20261126000008_final_database_integrity_remediation.sql` | Penguatan lifecycle QR (`revoked_at` tidak dapat diaktifkan ulang, `token_hash`/`scope`/`created_at` immutable, tolak konsumsi token kedaluwarsa), konsistensi dua arah `bookings` (`FULFILLED` = tepat 1 loan; non-`FULFILLED` = 0 loan), proteksi `DELETE` & perubahan FK pada `loans`/`return_inspections`/`maintenance_records`, konsistensi `unit_disposition`↔`projectors.physical_status`, dan `BORROWED` wajib punya `ACTIVE` loan. |
| 009 | `20261126000009_fix_deferred_triggers_and_qr_security.sql` | Memperbaiki kelima deferred constraint trigger agar membaca **kondisi akhir record dari tabel berdasarkan primary key**, serta menutup celah QR security (`revoked_at` + `loan_id` pada insert, proteksi token selesai, aturan `expires_at`). |
| 010 | `20261126000010_fix_sql_trigger_and_qr_clock.sql` | Memperbaiki deteksi `DELETE` pada `verify_projector_status_consistency()` dengan menyimpan `v_projector_exists := FOUND` sebelum `SELECT EXISTS`, mengganti `pg_catalog.now()` ke `pg_catalog.clock_timestamp()` pada validasi expiry QR, serta menambahkan `projector_lifecycle_seq` / `lifecycle_seq` agar urutan kausal `return_inspections` vs `maintenance_records` akurat meski dieksekusi dalam satu transaksi yang sama. |
| 011 | `20261126000011_grant_service_role_privileges.sql` | Memberikan `GRANT` eksplisit pada tabel (`SELECT, INSERT` pada `audit_logs`; `ALL` pada 12 tabel lain), sequence, fungsi di `public`, serta `ALTER DEFAULT PRIVILEGES` khusus untuk `service_role` agar backend client tidak terkena `42501 permission denied` bila `001`–`010` dijalankan lewat `psql`. |
| 012 | `20261126000012_komting_atomic_workflows.sql` | Menambahkan 4 RPC PostgreSQL atomik (`rpc_admin_approve_komting_application`, `rpc_admin_reject_komting_application`, `rpc_admin_approve_komting_replacement`, `rpc_admin_deactivate_komting_assignment`) dengan `FOR UPDATE` locking, audit log, dan email outbox dalam satu transaksi (`EXECUTE` hanya untuk `service_role`). |
| 013 | `20261126000013_be3_operating_hours_and_projector_workflows.sql` | Menambahkan RPC atomik BE-3 (`rpc_admin_upsert_operating_hours` dengan per-date advisory lock dan deteksi konflik `CONFIRMED` booking, serta `rpc_admin_deactivate_projector` dengan validasi transaksi aktif dan audit log) khusus untuk `service_role`. |
| 014 | `20261126000014_be4_booking_and_pickup_atomic_workflows.sql` | Menambahkan RPC atomik BE-4 (`rpc_komting_create_booking`, `rpc_komting_cancel_booking`, dan `rpc_staff_confirm_pickup`) dengan row-level locking, QR lifecycle, audit log, dan outbox notification event dalam satu transaksi atomik. |

## Protokol Transaksi Server-Side & Concurrency

Exclusion constraint `excl_bookings_no_overlap_per_projector` pada `bookings` **tidak cukup** sendirian untuk menjaga konsistensi lintas tabel (misalnya benturan booking hari ini terhadap `loans` berstatus `ACTIVE`, perubahan `projectors.physical_status`, atau race condition antara pickup dengan cancel/expiry). Backend wajib menjalankan operasi mutasi di dalam transaksi PostgreSQL (`service_role` / server-side DB pool) dengan urutan row locking yang konsisten untuk mencegah deadlock:

1. **Create Booking (`POST /api/v1/bookings`):**
   - Reservasi kunci idempotency (`INSERT INTO idempotency_records ... ON CONFLICT DO NOTHING`).
   - Kunci baris `users` + `komting_assignments` aktif (`FOR SHARE`/`FOR UPDATE`) untuk validasi status akun dan penugasan komting aktif.
   - Kunci baris `projectors` target (`SELECT ... FROM public.projectors WHERE id = $1 FOR UPDATE`) untuk memvalidasi `is_active = TRUE` dan `physical_status` (booking hari ini wajib `AVAILABLE`; booking besok diizinkan saat `BORROWED` selama bukan `MAINTENANCE`/`INACTIVE`).
   - Pastikan tidak ada `ACTIVE` loan untuk komting maupun tabrakan hari ini dengan unit yang sedang `BORROWED`.
   - Insert `bookings` (`CONFIRMED`), buat `qr_tokens`, `email_outbox`, `audit_logs`, lalu selesaikan `idempotency_records` dalam transaksi yang sama.
2. **Konfirmasi Pickup (`POST /api/v1/staff/bookings/{id}/pickup`):**
   - Kunci dalam urutan deterministik: `projectors` (`FOR UPDATE`) → `bookings` (`FOR UPDATE`) → `qr_tokens` (`FOR UPDATE`).
   - Validasi ulang window pickup, status booking `CONFIRMED`, `qr_tokens.pickup_used_at IS NULL`, `revoked_at IS NULL`, dan status fisik unit `AVAILABLE`.
   - Dalam satu transaksi atomik: update `bookings.status = 'FULFILLED'`, update `projectors.physical_status = 'BORROWED'`, insert `loans` (`ACTIVE`), update `qr_tokens` (`loan_id`, `pickup_used_at`, dan perpanjangan `expires_at` bila disepakati untuk fase return), insert `audit_logs` & `email_outbox`.
3. **Konfirmasi Return (`POST /api/v1/staff/loans/{id}/return`):**
   - Kunci `projectors` (`FOR UPDATE`) → `loans` (`FOR UPDATE`) → `qr_tokens` (`FOR UPDATE`).
   - Validasi `loans.status = 'ACTIVE'`, `qr_tokens.return_used_at IS NULL`, dan kelengkapan inspeksi/foto bukti.
   - Dalam satu transaksi atomik: update `loans.status = 'RETURNED'`, insert `return_inspections`, update `projectors.physical_status` (`AVAILABLE` atau `MAINTENANCE` sesuai `unit_disposition`), stamp `qr_tokens.return_used_at`, insert `audit_logs` & `email_outbox`.
4. **Scheduled Jobs (`midnight_availability`, `booking_expiry`) & Maintenance:**
   - Gunakan `SELECT ... FOR UPDATE SKIP LOCKED` pada kandidat booking/outbox dan kunci baris `projectors` (`FOR UPDATE`) saat mengubah `physical_status` atau membatalkan booking terdampak.

## Prosedur Verifikasi Lokal & Runtime Testing

### A. Validasi Statis (tanpa PostgreSQL hidup)

```bash
node supabase/tests/verify-migrations.mjs
```

### B. Validasi Runtime pada Dedicated Supabase Testing Project (Disarankan bila Docker tidak tersedia)

Siapkan **project Supabase testing yang terpisah** (bukan production dan bukan project PINJAM aktif), lalu jalankan `supabase/tests/run-runtime-validation.sh` menggunakan `psql` (tersedia di `/opt/homebrew/opt/libpq/bin/psql` atau `$PATH`):

```bash
TEST_DATABASE_URL="postgresql://postgres:<TEST_DB_PASSWORD>@db.<TEST_PROJECT_REF>.supabase.co:5432/postgres?sslmode=require" \
  bash supabase/tests/run-runtime-validation.sh
```

Script tersebut secara berurutan:
1. Menerapkan `001`–`010` dengan `ON_ERROR_STOP=1`.
2. Menjalankan `supabase/tests/verify-database-foundation.sql` (dalam `BEGIN; ... ROLLBACK;` untuk menguji seluruh trigger, deferred constraints, QR lifecycle/expiry, skenario booking/pickup/loan/return/inspection/maintenance, dan RLS multi-aktor `KOMTING A`, `KOMTING B`, `STAFF`, `ADMIN`).
3. Menjalankan `supabase/tests/verify-concurrency.sh` (dua koneksi `psql` paralel untuk menguji race condition `Idempotency-Key`, overlap booking, dan pickup ganda).

Atau melalui Supabase CLI (`npx supabase`) ke **project testing terpisah** setelah mengonfirmasi `<TEST_PROJECT_REF>`:

```bash
npx supabase link --project-ref <TEST_PROJECT_REF>
npx supabase db push --dry-run
npx supabase db push
```

> **Catatan:** Jangan menerapkan migration ke database Supabase production/aktif tanpa persetujuan tim dan backup terlebih dahulu.
