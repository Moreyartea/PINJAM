# FRONTEND INTEGRATION READINESS — PINJAM

- **Tanggal Evaluasi:** 26 November 2026
- **Branch Frontend:** `feat/frontend-fe4-admin`
- **Commit Acuan:** `07ac12e` (`feat(frontend): enhance admin dashboard`)
- **Dokumen Kontrak Acuan:** `API_CONTRACT_PINJAM.md` (v1.0.0), `FRONTEND_SPEC_PINJAM.md` (v1.0.0)
- **Status Kesiapan Integrasi Keseluruhan:** **PARTIALLY READY** *(Integrasi backend terhalang pada autentikasi nyata, beberapa kontrak endpoint ADMIN/STAFF, serta skema respons tertentu yang masih terbuka)*

---

## 1. Executive Summary

- **Status Keseluruhan:** **PARTIALLY READY**
- **Ringkasan Kesiapan:**
  - Arsitektur frontend PINJAM (FE-0 s.d. FE-4.10) telah lengkap secara modular dengan pemisahan antara layer UI/feature (`src/features/*`), service registry (`src/services/contracts.ts`), real HTTP client (`src/services/api/api-services.ts` + `src/lib/api/client.ts`), serta dev-only mock services (`src/services/mock/mock-services.ts`).
  - Dari **51 item endpoint/kapabilitas API** yang dipetakan: **26 READY**, **13 PARTIALLY READY**, dan **12 NOT READY**.
  - **Penghalang Utama (*Blockers*) untuk integrasi penuh:**
    1. **Auth Provider Nyata Belum Terdaftar:** Interface `AuthProviderAdapter` sudah siap, tetapi belum ada implementasi adapter provider (mis. Supabase Auth) yang didaftarkan di `AppProviders`, serta belum ada mekanisme auto-refresh / interceptor `401` terpusat pada request fitur.
    2. **Endpoint ADMIN & STAFF Belum Tersedia di Kontrak:** Daftar & detail komting assignment (`GET /api/v1/admin/komting/assignments*`), manajemen akun `STAFF` penuh, akses privat foto identitas pendaftar komting, serta daftar field resmi koreksi transaksi (§13.3).
    3. **Skema Dashboard & Agregat Belum Baku:** `GET /api/v1/staff/dashboard` (§7.4) belum memiliki kontrak JSON baku, dan `GET /api/v1/projectors` belum menyediakan agregat jumlah per `physical_status` untuk inventaris >100 unit.
  - Mode mock (`NEXT_PUBLIC_USE_MOCK_API=true`) secara otomatis dinonaktifkan pada build production (`NODE_ENV === "production"`), sehingga transisi ke API backend nyata dapat dilakukan secara bertahap per domain begitu auth adapter dan endpoint prioritas backend aktif.

---

## 2. Frontend Architecture

- **Status Bagian:** **READY**

Frontend dibangun di atas Next.js App Router (`^16.4.6`), React (`^19.3.1`), TypeScript (`strict: true`), dan Vitest (`5.1.2`):

1. **Routing & Guard (`src/app/*`, `src/components/auth/role-guard.tsx`):**
   - Publik/Auth: `/login`, `/register`, `/verify-email`, `/application/status`, `/forbidden`.
   - KOMTING (`/komting/*`): `/komting`, `/komting/projectors`, `/komting/bookings`, `/komting/bookings/new`, `/komting/bookings/[id]`, `/komting/loans`.
   - STAFF (`/staff/*`): `/staff`, `/staff/bookings`, `/staff/bookings/[id]`, `/staff/scan`, `/staff/loans`, `/staff/loans/[id]/return`, `/staff/maintenance`, `/staff/maintenance/[id]`.
   - ADMIN (`/admin/*`): `/admin`, `/admin/applications`, `/admin/applications/[id]`, `/admin/assignments`, `/admin/projectors`, `/admin/projectors/[id]`, `/admin/maintenance`, `/admin/operating-hours`, `/admin/audit-logs`, `/admin/audit-logs/[id]`, `/admin/staff`, `/admin/corrections`.
   - Setiap rute terproteksi dibungkus `RoleGuard` (`allowedRoles`) dan shell sesuai peran (`KomtingShell`, `StaffShell`, `AdminShell`).
2. **State & Data Fetching (`src/hooks/use-async-query.ts`, `src/lib/auth/auth-context.tsx`):**
   - `AuthProvider` melakukan bootstrap sesi saat aplikasi dimuat melalui `services.auth.getSession()` dan memverifikasi profil otoritatif via `services.me.getMe()`.
   - Fitur menggunakan `useAsyncQuery` untuk loading, error ter-normalisasi, dan reload/retry tanpa menyimpan state transaksi kritis atau QR di `localStorage`.
3. **Service Abstraction Layer (`src/services/index.ts`, `src/services/contracts.ts`):**
   - Semua feature view hanya memanggil `services.<domain>.<method>`.
   - `services` memilih `mockServices` atau `apiServices` berdasarkan `env.useMockApi` (`!isProduction && NEXT_PUBLIC_USE_MOCK_API === "true"`).
4. **Domain Validation & Idempotency (`src/lib/validation/*`, `src/lib/utils/idempotency.ts`, `src/lib/utils/date.ts`):**
   - Validasi client-side bersifat advisori (waktu `Asia/Jakarta`, prasyarat foto return, alasan penolakan/penonaktifan, jam operasional), sedangkan kebenaran bisnis dan idempotensi mutasi tetap ditegakkan backend.

---

## 3. API Endpoint Mapping

Seluruh endpoint mengacu strictly pada `API_CONTRACT_PINJAM.md` (v1.0.0) dan `src/services/api/api-services.ts`.

### 3.1 Authentication

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| Provider Auth Session (`getSession`) | Client SDK / Provider | Bootstrap sesi & pemulihan login | `services.auth.getSession` | Mock + Adapter Interface (`getAuthProviderAdapter`) | NOT READY | `AppProviders` belum mendaftarkan implementasi adapter nyata; mode non-mock melempar `AUTH_PROVIDER_NOT_CONFIGURED` jika belum diregistrasi. |
| Provider Auth Login (`signInWithPassword`) | Client SDK / `POST` Provider | Login email & password (`/login`) | `services.auth.signInWithPassword` | Mock + Adapter Interface | NOT READY | Menunggu keputusan & registrasi provider autentikasi final (§20 Open Decision). |
| Provider Email Verification (`verifyEmail`) | Client SDK / Callback | Verifikasi email (`/verify-email`) | `services.auth.verifyEmail` | Mock + Adapter Interface | NOT READY | Format `token`/`token_hash`/`type` sudah siap di adapter; menunggu konfigurasi provider. |
| Provider Logout (`signOut`) | Client SDK / `POST` | Keluar akun dari semua shell | `services.auth.signOut` | Mock + Adapter Interface | PARTIALLY READY | `AuthProvider.signOut` membersihkan token memori & state UI dengan aman; adapter provider nyata opsional/menunggu keputusan §5.3. |

### 3.2 User Profile

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/me` | `GET` | Profil aktif, `RoleGuard`, & `/admin/staff` | `services.me.getMe` | Mock & Real (`apiServices.me.getMe`) | READY | Membutuhkan `Authorization: Bearer <access_token>`. Mengembalikan `UserProfile` + `komting_assignment`. |
| `/api/v1/me` | `PATCH` | Pembaruan `full_name` terbatas (`/admin/staff`) | `services.me.updateMe` | Mock & Real (`apiServices.me.updateMe`) | READY | Hanya menerima `{ full_name }`; `role` & `account_status` dikunci oleh kontrak §5.2. |

### 3.3 Komting

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/komting/applications` | `POST` | Pengajuan pendaftaran komting baru / replacement (`/register`) | `services.application.submitApplication` | Mock & Real | READY | Mengirim `multipart/form-data` tanpa memaksa header `Content-Type`. |
| `/api/v1/komting/applications/me` | `GET` | Pemantauan status pengajuan komting (`/application/status`) | `services.application.getMyApplication` | Mock & Real | READY | Menampilkan status verifikasi dan alasan penolakan bila ditolak. |
| `/api/v1/komting/dashboard` | `GET` | Dashboard KOMTING (`/komting`) | `services.admin.getKomtingDashboard` | Mock & Real | PARTIALLY READY | Endpoint tercantum di §7.1, namun struktur field JSON detail bersifat opsional sehingga UI memakai fallback defensif. |

### 3.4 Booking

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/bookings` | `POST` | Pembuatan booking proyektor (`/komting/bookings/new`) | `services.booking.createBooking` | Mock & Real | READY | Mengirim header `Idempotency-Key` dan payload `{ projector_id, booking_date, start_time, estimated_return_at }`. |
| `/api/v1/komting/bookings` | `GET` | Daftar booking milik KOMTING (`/komting/bookings`) | `services.booking.listKomtingBookings` | Mock & Real | READY | Mendukung query `status`, `page`, `page_size`. |
| `/api/v1/komting/bookings/{booking_id}` | `GET` | Detail booking milik KOMTING (`/komting/bookings/[id]`) | `services.booking.getKomtingBooking` | Mock & Real | READY | Menampilkan jendela pickup dan status booking. |
| `/api/v1/komting/bookings/{booking_id}/cancel` | `POST` | Pembatalan booking oleh KOMTING (`/komting/bookings/[id]`) | `services.booking.cancelKomtingBooking` | Mock & Real | PARTIALLY READY | Payload `{ reason }` siap; aturan batas waktu pembatalan masih Open Decision §20 sehingga validasi final mengandalkan backend. |
| `/api/v1/komting/bookings/{booking_id}/qr` | `GET` | Pengambilan `qr_payload` opaque (`/komting/bookings/[id]`) | `services.qr.getBookingQr` | Mock & Real | READY | QR dirender via SVG tanpa persistensi `localStorage`. |
| `/api/v1/staff/bookings` | `GET` | Daftar booking operasional (`/staff/bookings`) | `services.booking.listStaffBookings` | Mock & Real | PARTIALLY READY | Model §4.4 tidak memuat `komting_name`/`class_name`; UI lookup proyektor via `/projectors` dan fallback `komting_id`. |
| `/api/v1/staff/bookings/{booking_id}` | `GET` | Detail booking operasional (`/staff/bookings/[id]`) | `services.booking.getStaffBooking` | Mock & Real | PARTIALLY READY | Menggunakan lookup proyektor terpisah serta fallback ID komting sesuai kontrak §4.4. |

### 3.5 Availability

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/availability` | `GET` | Cek kelayakan booking unit per tanggal (`/komting/projectors`, `/komting/bookings/new`) | `services.availability.checkAvailability` | Mock & Real | READY | Query `projector_id`, `date`. Slot terperinci belum tersedia di §8.1 sehingga UI validasi mengandalkan backend saat submit. |

### 3.6 Loan

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/komting/loans` | `GET` | Riwayat peminjaman KOMTING (`/komting/loans`) | `services.loan.listKomtingLoans` | Mock & Real | READY | Mendukung query `status`, `page`, `page_size`. |
| `/api/v1/staff/loans` | `GET` | Daftar peminjaman operasional (`/staff/loans`) & pencarian loan aktif RETURN QR | `services.loan.listStaffLoans` | Mock & Real | PARTIALLY READY | Model §4.5 tanpa `booking_code`/`komting_name`; fallback `booking_id`/`komting_id`. |
| `/api/v1/staff/loans/{loan_id}` | `GET` | Detail peminjaman & form pengembalian (`/staff/loans/[id]/return`) | `services.loan.getStaffLoan` | Mock & Real | PARTIALLY READY | Lookup unit dari `/projectors/{projector_id}` dengan fallback ID komting/booking. |
| `/api/v1/staff/loans/{loan_id}/return` | `POST` | Konfirmasi pengembalian & inspeksi (`/staff/loans/[id]/return`) | `services.loan.confirmReturn` | Mock & Real | READY | Mengirim `FormData` (`evidence_photo` wajib saat `DAMAGED`/`INCOMPLETE`) + header `Idempotency-Key`. |

### 3.7 Projector

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/projectors` | `GET` | Daftar proyektor KOMTING, STAFF, & ADMIN (`/komting/projectors`, `/admin/projectors`, `/admin/maintenance`, `/admin`) | `services.projector.listProjectors` | Mock & Real | READY | Mendukung `physical_status`, `page`, `page_size`. Belum ada agregat statistik bila >100 unit pada dashboard. |
| `/api/v1/projectors/{projector_id}` | `GET` | Detail proyektor (`/admin/projectors/[id]`, lookup detail) | `services.projector.getProjector` | Mock & Real | READY | Memisahkan `physical_status` dan `is_active`. |
| `/api/v1/admin/projectors` | `POST` | Tambah proyektor (`/admin/projectors`) | `services.projector.createProjector` | Mock & Real | READY | Payload `{ asset_code, name, brand, model }`. |
| `/api/v1/admin/projectors/{projector_id}` | `PATCH` | Edit metadata unit (`/admin/projectors/[id]`) | `services.projector.updateProjector` | Mock & Real | READY | `asset_code` dan `physical_status` tidak diubah melalui endpoint ini. |
| `/api/v1/admin/projectors/{projector_id}/deactivate` | `POST` | Penonaktifan inventaris proyektor (`/admin/projectors/[id]`) | `services.projector.deactivateProjector` | Mock & Real | READY | Menangani konflik `PROJECTOR_HAS_ACTIVE_LOAN` (`409`). |

### 3.8 Staff Operations

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/staff/qr/validate` | `POST` | Validasi QR `PICKUP`/`RETURN` (`/staff/scan`, `/staff/bookings/[id]`) | `services.qr.validateQr` | Mock & Real | PARTIALLY READY | Respons §9.2 belum menyertakan `loan_id` untuk aksi `RETURN`; UI mencari `loan_id` aktif via `/staff/loans?status=ACTIVE`. |
| `/api/v1/staff/bookings/{booking_id}/pickup` | `POST` | Konfirmasi serah-terima (`/staff/scan`, `/staff/bookings/[id]`) | `services.qr.confirmPickup` | Mock & Real | READY | Mengirim `Idempotency-Key` dan informasi penerima `KOMTING`/`REPRESENTATIVE`. |

### 3.9 Maintenance

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/staff/maintenance` | `GET` | Daftar maintenance (`/staff/maintenance`, `/admin/maintenance`, `/staff/maintenance/[id]`) | `services.maintenance.listMaintenance` | Mock & Real | READY | Dipakai bersama oleh STAFF dan ADMIN sesuai matriks akses §3.4. |
| `/api/v1/staff/maintenance/{maintenance_id}` *(Gap)* | `GET` | Detail maintenance (`/staff/maintenance/[id]`) | *(Belum ada di kontrak)* | Pencarian paginasi via `listMaintenance` | NOT READY | Belum tersedia di §11; detail mencari maks 10 halaman × 20 item dari endpoint daftar. |
| `/api/v1/staff/projectors/{projector_id}/maintenance` | `POST` | Tandai unit masuk maintenance (`/staff/maintenance`, `/admin/maintenance`) | `services.maintenance.createMaintenance` | Mock & Real | READY | Mengubah status fisik unit ke `MAINTENANCE` dan membatalkan booking terdampak di backend. |
| `/api/v1/staff/maintenance/{maintenance_id}/complete` | `POST` | Selesaikan maintenance & nyatakan layak (`/staff/maintenance`, `/admin/maintenance`) | `services.maintenance.completeMaintenance` | Mock & Real | READY | Menangani konflik `PROJECTOR_HAS_ACTIVE_LOAN` (`409`) dari backend. |

### 3.10 Admin Applications

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/admin/komting/applications` | `GET` | Daftar pengajuan & ringkasan dashboard (`/admin/applications`, `/admin`) | `services.application.listAdminApplications` | Mock & Real | READY | Mendukung filter `status`, `page`, `page_size`. |
| `/api/v1/admin/komting/applications/{application_id}` | `GET` | Detail pengajuan komting (`/admin/applications/[id]`) | `services.application.getAdminApplication` | Mock & Real | PARTIALLY READY | Belum menyertakan mekanisme signed URL foto identitas privat maupun objek komting lama saat replacement. |
| `/api/v1/admin/komting/applications/{application_id}/approve` | `POST` | Persetujuan pengajuan baru (`/admin/applications/[id]`) | `services.application.approveApplication` | Mock & Real | READY | Payload `{ admin_note }`. |
| `/api/v1/admin/komting/applications/{application_id}/reject` | `POST` | Penolakan pengajuan (`/admin/applications/[id]`) | `services.application.rejectApplication` | Mock & Real | READY | Wajib `{ reason }`. |
| `/api/v1/admin/komting/applications/{application_id}/approve-replacement` | `POST` | Persetujuan pergantian komting atomik (`/admin/applications/[id]`) | `services.application.approveReplacement` | Mock & Real | PARTIALLY READY | Mengirim `Idempotency-Key`; mekanisme konfirmasi/tenggat komting lama masih Open Decision §6.7/§20. |
| Akses Foto Identitas Privat *(Gap)* | `GET` | Pratinjau foto identitas pada `/admin/applications/[id]` | *(Belum ada di kontrak)* | Placeholder aman | NOT READY | Kontrak §6.3 & §17 belum mendefinisikan endpoint/signed URL privat. |

### 3.11 Admin Assignments

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/admin/komting/assignments/{assignment_id}/deactivate` | `POST` | Penonaktifan assignment (`/admin/assignments`) | `services.application.deactivateAssignment` | Mock & Real | READY | Payload `{ reason }`, konfirmasi dampak booking/loan. |
| `/api/v1/admin/komting/assignments` *(Gap)* | `GET` | Daftar penugasan aktif & riwayat (`/admin/assignments`) | *(Belum ada di kontrak)* | Gap notice di UI | NOT READY | Kontrak §6 belum menyediakan endpoint daftar & filter assignment. |
| `/api/v1/admin/komting/assignments/{assignment_id}` *(Gap)* | `GET` | Detail penugasan komting | *(Belum ada di kontrak)* | Belum diimplementasikan | NOT READY | Kontrak §6 belum menyediakan endpoint detail assignment. |

### 3.12 Operating Hours

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/operating-hours` | `GET` | Cek jam layanan (`/komting/bookings/new`, `/admin/operating-hours`) | `services.operatingHours.getOperatingHours` | Mock & Real | READY | Query `date=YYYY-MM-DD`. |
| `/api/v1/admin/operating-hours/{date}` | `PUT` | Ubah jam operasional (`/admin/operating-hours`) | `services.operatingHours.updateOperatingHours` | Mock & Real | PARTIALLY READY | Payload `{ opens_at, closes_at, admin_early_open_at, note }` siap; aturan hitung `early_pickup_allowed_at` & struktur `details` konflik `409` masih menunggu kepastian §23. |

### 3.13 Audit Log

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/admin/audit-logs` | `GET` | Daftar audit log (`/admin/audit-logs`, `/admin`) | `services.auditLog.listAuditLogs` | Mock & Real | PARTIALLY READY | Hanya mendukung filter `entity_type`, `entity_id`, `page`, `page_size` tanpa filter `actor_user_id`/`action`/tanggal dan tanpa `actor_name`. |
| `/api/v1/admin/audit-logs/{audit_log_id}` | `GET` | Detail audit log read-only (`/admin/audit-logs/[id]`) | `services.auditLog.getAuditLog` | Mock & Real | READY | Menampilkan `before_data`, `after_data`, `reason`, dan metadata aktor. |

### 3.14 Dashboard

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/staff/dashboard` | `GET` | Ringkasan operasional `/staff` & `/admin` | `services.admin.getStaffDashboard` | Mock & Real | PARTIALLY READY | Struktur JSON §7.4 belum baku; belum ada endpoint agregat khusus `/admin/dashboard`. |

### 3.15 User Management

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/admin/staff` / `users` *(Gap)* | `GET` | Daftar akun STAFF, pencarian, pagination (`/admin/staff`) | *(Belum ada di kontrak)* | Gap notice di UI | NOT READY | Kontrak §3.2/§3.4 belum mendefinisikan endpoint list STAFF. |
| `/api/v1/admin/staff` / `users` *(Gap)* | `POST` | Pembuatan akun STAFF manual oleh ADMIN | *(Belum ada di kontrak)* | Tidak dibuat UI fiktif | NOT READY | Self-registration STAFF dilarang PRD/Frontend Spec. |
| `/api/v1/admin/staff/{user_id}` *(Gap)* | `PATCH` | Ubah informasi akun STAFF | *(Belum ada di kontrak)* | Tidak dibuat UI fiktif | NOT READY | Field yang boleh diedit belum didefinisikan. |
| `/api/v1/admin/staff/{user_id}/activate\|deactivate` *(Gap)* | `POST` | Aktivasi & penonaktifan akun STAFF | *(Belum ada di kontrak)* | Tidak dibuat UI fiktif | NOT READY | Menunggu endpoint & aturan audit penonaktifan akun. |

### 3.16 Transaction Corrections

| Endpoint | Method | Fitur | Service Frontend | Mock/Real | Status Integrasi | Catatan |
|---|---|---|---|---|---|---|
| `/api/v1/admin/transactions/{transaction_id}/corrections` | `POST` | Koreksi transaksi ADMIN (`/admin/corrections`) | `services.admin.correctTransaction` | Mock & Real (halaman status) | NOT READY | Endpoint §13.3 masih kerangka kontrak; daftar field yang diizinkan dan daftar transaksi target masih Open Decision §20. |

**Rekapitulasi Status Endpoint/Kapabilitas (Total 51 item):**
- **READY:** `26`
- **PARTIALLY READY:** `13`
- **NOT READY:** `12`

---

## 4. API Client Readiness

- **Status Bagian:** **PARTIALLY READY** *(Fondasi `apiRequest` kuat dan sesuai kontrak, dengan beberapa catatan minor untuk integrasi produksi)*

Evaluasi terperinci `src/lib/api/client.ts` dan `src/lib/api/errors.ts`:

1. **Base URL & Environment Variables (`src/lib/config/env.ts`):**
   - `apiRequest` menggabungkan `env.apiBaseUrl` (`NEXT_PUBLIC_API_BASE_URL` tanpa trailing slash) dengan prefix konstan `/api/v1`.
   - Jika `NEXT_PUBLIC_API_BASE_URL` kosong, request akan jatuh ke origin frontend (`/api/v1/...`), cocok jika memakai reverse proxy/Next.js rewrites, namun perlu diisi eksplisit pada cross-origin deployment.
2. **Authorization Header & Access Token Handling:**
   - `tokenProvider` (diikat dari `src/lib/auth/provider-adapter.ts`) dipanggil sebelum setiap request; bila menghasilkan string token, client otomatis menyisipkan `Authorization: Bearer <token>`.
   - **Temuan:** Belum ada interceptor `401` otomatis di `apiRequest` untuk me-refresh token yang baru kedaluwarsa saat sesi berjalan dan mengulang request gagal. Penanganan `401` saat ini mengandalkan UI menampilkan pesan `AUTH_REQUIRED` atau `AuthProvider.refreshMe()` saat dipanggil manual.
3. **Error Response Parsing & HTTP Status Handling:**
   - `isApiErrorResponse` memvalidasi envelope `{ error: { code, message, details }, meta: { request_id } }`.
   - Jika response non-JSON atau error body tidak mengikuti format kontrak, fallback status saat ini hanya membedakan `401 -> AUTH_REQUIRED` dan `403 -> FORBIDDEN`; status `404`, `409`, `422`, atau `5xx` HTML/proxy error akan jatuh ke `UNKNOWN_ERROR` bila backend tidak mengembalikan envelope JSON PINJAM.
   - `getSafeErrorMessage(code, fallback)` memprioritaskan kamus pesan aman `ERROR_MESSAGES` pada frontend ketika `code` dikenal, sehingga detail error spesifik per field dari backend perlu dikirim melalui `error.details` (`ApiErrorDetail[]`).
4. **Timeout & Request Cancellation:**
   - Default timeout `15000` ms memakai `AbortController` dan meneruskan `signal` eksternal jika diberikan.
   - **Temuan:** Pada `normalizeUnknownError`, seluruh `DOMException` dengan `name === "AbortError"` (baik timeout maupun pembatalan caller) dipetakan ke kode `TIMEOUT` (`status: 0`). Tidak mengganggu operasional normal karena `useAsyncQuery` memakai flag `active` daripada `AbortSignal`, namun perlu diperhatikan bila kelak memakai `AbortSignal` untuk cancel request aktif.
5. **Idempotency-Key & Upload `multipart/form-data`:**
   - Header `Idempotency-Key` otomatis dikirim bila parameter `idempotencyKey` diberikan (`createBooking`, `confirmPickup`, `confirmReturn`, `approveReplacement`), dan UI sudah menjaga reuse key untuk payload identik saat retry serta rotasi saat input berubah.
   - Jika `formData` diisi, `apiRequest` tidak memaksakan header `Content-Type` agar browser otomatis menambahkan `multipart/form-data; boundary=...` (sesuai §17 API Contract).
6. **Format Response Envelope & `204 No Content`:**
   - Mendukung envelope `ApiSingleResponse<T>` (`data`, `meta.request_id`), `ApiListResponse<T>` (`meta.pagination`), dan status `204` (`undefined`). Jika response sukses non-204 bukan JSON valid, melempar `INVALID_RESPONSE`.

---

## 5. Authentication Readiness

- **Status Bagian:** **NOT READY** *(Abstraksi frontend lengkap, tetapi adapter ke auth provider nyata belum diimplementasikan maupun didaftarkan)*

Status tiap komponen autentikasi saat `NEXT_PUBLIC_USE_MOCK_API=false`:

| Komponen Auth | Status | Kondisi Aktual pada Codebase | Kebutuhan untuk Siap Integrasi |
|---|---|---|---|
| **Login (`signInWithPassword`)** | **NOT READY** | `apiServices.auth.signInWithPassword` memanggil `getAuthProviderAdapter()`; tanpa adapter terdaftar akan melempar `500 AUTH_PROVIDER_NOT_CONFIGURED`. | Tentukan provider autentikasi (§20), pasang SDK/endpoint login, dan panggil `registerAuthProviderAdapter(...)` di startup client (`AppProviders`). |
| **Session Persistence & Restoration** | **NOT READY** | Token akses disimpan di memori (`inMemoryAccessToken`) pada `provider-adapter.ts`; pemulihan saat reload bergantung pada `activeAdapter.getSession()`. | Implementasi `getSession()` pada adapter provider nyata (mis. baca session terkelola SDK atau cookie HTTP-only). |
| **Access Token Binding** | **READY** | `setAccessTokenProvider` di `provider-adapter.ts` otomatis membaca `inMemoryAccessToken` dan fallback ke `activeAdapter.getSession()`. | Pastikan `getSession()` mengembalikan JWT/access token yang valid untuk `Authorization: Bearer` backend. |
| **Refresh Token & Token Expired** | **NOT READY** | Belum ada pembaruan otomatis token expired saat `apiRequest` menerima `401` di halaman fitur; `401` hanya memicu status `"expired"` di `loadCurrentUser()` (`getMe`/`refreshMe`). | Tambahkan token refresh via `activeAdapter.getSession()` saat `401` atau pastikan adapter selalu merotasi token sebelum kedaluwarsa. |
| **Logout (`signOut`)** | **PARTIALLY READY** | `AuthProvider.signOut` memanggil `services.auth.signOut()`, lalu menghapus token memori dan state user di client. | Lengkapi `adapter.signOut()` bila provider mengelola sesi eksternal atau endpoint server logout. |
| **Email Verification** | **NOT READY** | `/verify-email` meneruskan `token`, `token_hash`, `type` ke `services.auth.verifyEmail`, yang bergantung pada adapter terdaftar. | Sesuaikan parameter callback URL dan implementasikan `adapter.verifyEmail()`. |
| **Role Mapping & Post-Login Redirect** | **READY** | Role diambil dari `GET /api/v1/me` (`user.role`, `user.account_status`), lalu `/login` mengarahkan sesuai role (`KOMTING` aktif/pending, `STAFF`, `ADMIN`). | Backend wajib mengembalikan objek `UserProfile` sesuai §4.1 & §5.1 pada `GET /api/v1/me`. |
| **Route Protection (`RoleGuard`)** | **READY** | `RoleGuard` memblokir akses lintas role (`/forbidden`) dan belum login/expired (`/login?next=...`). Backend tetap wajib menvalidasi role di setiap endpoint. | Sinkronkan middleware/RBAC backend dengan matriks akses §3.4. |

---

## 6. Mock vs Real API Mapping

- **Status Bagian:** **PARTIALLY READY** *(Switching `env.useMockApi` siap di layer service, tetapi 4 area masih belum punya endpoint real di kontrak)*

Mekanisme switching terpusat berada di `src/services/index.ts`:
- Saat `NODE_ENV !== "production"` **dan** `NEXT_PUBLIC_USE_MOCK_API === "true"` -> memakai `mockServices`.
- Saat `NODE_ENV === "production"` **atau** `NEXT_PUBLIC_USE_MOCK_API !== "true"` -> memakai `apiServices`.

| Service Registry (`services.*`) | Mode Mock (`mockServices`) | Mode Real (`apiServices`) | Dapat Dialihkan via Env? | Catatan Perubahan yang Masih Dibutuhkan |
|---|---|---|---|---|
| `services.me` | Stateful dev mock | `apiRequest("/me")` | **Ya** | Siap setelah auth adapter mengirim token valid ke backend. |
| `services.availability` | Stateful dev mock | `apiRequest("/availability")` | **Ya** | Siap; pastikan format jam `HH:mm:ss` Asia/Jakarta konsisten. |
| `services.booking` | Stateful dev mock + idempotensi | `apiRequest("/bookings", "/komting/bookings*", "/staff/bookings*")` | **Ya** | Siap; pastikan backend menangani header `Idempotency-Key` dan mengembalikan lookup/ID sesuai §4.4. |
| `services.loan` | Stateful dev mock | `apiRequest("/komting/loans", "/staff/loans*")` | **Ya** | Siap; pastikan backend menerima `multipart/form-data` `evidence_photo` pada `/return`. |
| `services.projector` | Stateful dev mock | `apiRequest("/projectors*", "/admin/projectors*")` | **Ya** | Siap untuk CRUD/inventaris; dashboard multi-halaman (>100 unit) perlu agregat jika unit bertambah besar. |
| `services.qr` | Simulasi token QR (`sim_qr_*`) | `apiRequest("/komting/bookings/*/qr", "/staff/qr/validate", "/staff/bookings/*/pickup")` | **Ya** | Siap; pastikan backend merespons sesuai §9.1–9.3. |
| `services.maintenance` | Stateful dev mock | `apiRequest("/staff/maintenance*", "/staff/projectors/*/maintenance")` | **Ya (parsial)** | List/create/complete siap; endpoint detail `GET /staff/maintenance/{id}` belum ada di kontrak. |
| `services.operatingHours` | Stateful dev mock + cek konflik | `apiRequest("/operating-hours", "/admin/operating-hours/*")` | **Ya** | Siap; pastikan format `details` konflik `409` disepakati. |
| `services.auditLog` | Fixtures 5 entri + filter/404 | `apiRequest("/admin/audit-logs*")` | **Ya** | Siap untuk filter `entity_type`/`entity_id`; filter aktor/aksi/tanggal belum ada di kontrak. |
| `services.application` | Stateful dev mock | `apiRequest("/komting/applications*", "/admin/komting/*")` | **Parsial** | Aplikasi & approve/reject/replacement/deactivate siap; **list/detail assignment** dan **private identity photo URL** belum ada endpoint real-nya. |
| `services.admin` | Simulasi dashboard | `apiRequest("/komting/dashboard", "/staff/dashboard", "/admin/transactions/*/corrections")` | **Parsial** | Dashboard siap dengan fallback opsional; **transaction corrections** masih menunggu daftar field §20. |
| `services.auth` | Simulasi email & token mock | Panggil `getAuthProviderAdapter()` | **Belum** | **Membutuhkan implementasi & registrasi adapter auth provider nyata** sebelum env non-mock bisa dipakai. |

---

## 7. API Contract Gaps

Berikut seluruh gap pada `API_CONTRACT_PINJAM.md` (v1.0.0) yang berdampak langsung pada integrasi frontend:

### Gap 1: Auth Provider Final & Mekanisme Verifikasi/Refresh Token (§3.1, §5.3, §20)
1. **Masalah:** Provider autentikasi final (mis. Supabase Auth / custom JWT), cara memperoleh refresh token, dan mekanisme callback verifikasi email belum ditetapkan final di kontrak.
2. **Dampak pada Frontend:** Mode real (`NEXT_PUBLIC_USE_MOCK_API=false`) langsung gagal saat login/session bootstrap (`AUTH_PROVIDER_NOT_CONFIGURED`).
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Kepastian provider auth, format JWT/session, masa berlaku token, dan endpoint/SDK flow verifikasi email & logout.
4. **Prioritas:** **BLOCKER**

### Gap 2: Akses Privat Foto Identitas Pendaftar Komting (`/admin/applications/[id]`, §6.3, §17)
1. **Masalah:** Kontrak mewajibkan foto identitas diakses lewat mekanisme privat yang diotorisasi, tetapi belum mendefinisikan endpoint proxy maupun field signed URL pada response `GET /api/v1/admin/komting/applications/{application_id}`.
2. **Dampak pada Frontend:** ADMIN tidak dapat mempratinjau foto KRS/identitas pendaftar secara langsung saat verifikasi pengajuan komting.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Field signed URL atau endpoint terotorisasi (beserta TTL/content-type) untuk mengambil foto identitas pendaftar.
4. **Prioritas:** **HIGH**

### Gap 3: Endpoint Daftar & Detail Komting Assignment (`/admin/assignments`, §6)
1. **Masalah:** Kontrak baru memiliki mutasi `POST /api/v1/admin/komting/assignments/{assignment_id}/deactivate` (§6.8), belum menyediakan `GET /api/v1/admin/komting/assignments` maupun `GET /api/v1/admin/komting/assignments/{assignment_id}`.
2. **Dampak pada Frontend:** `/admin/assignments` tidak dapat menampilkan tabel assignment aktif, kelas, identitas mahasiswa, maupun tanggal mulai/berakhir; ADMIN harus mengetahui `assignment_id` untuk menonaktifkan assignment.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Definisi endpoint daftar (filter kelas/status, pagination) dan detail assignment komting.
4. **Prioritas:** **HIGH**

### Gap 4: Endpoint Manajemen Akun STAFF & Pengguna (`/admin/staff`, §3.2, §3.4)
1. **Masalah:** Matriks akses mengakui ADMIN mengelola akun STAFF, tetapi belum ada endpoint untuk list, search/filter, buat akun STAFF manual, ubah data, dan aktivasi/nonaktif akun STAFF.
2. **Dampak pada Frontend:** `/admin/staff` hanya dapat menampilkan profil akun sendiri (`GET/PATCH /api/v1/me`) dan pemberitahuan gap kontrak tanpa CRUD STAFF.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Kontrak lengkap endpoint manajemen akun STAFF beserta field yang diperbolehkan dan error codes.
4. **Prioritas:** **HIGH**

### Gap 5: Skema JSON Baku Dashboard STAFF/ADMIN (§7.1, §7.4) & Agregat Statistik Proyektor
1. **Masalah:** `GET /api/v1/staff/dashboard` dan `GET /api/v1/komting/dashboard` belum memiliki skema field JSON baku (nama properti & tipe). Selain itu, `GET /api/v1/projectors` belum mengembalikan ringkasan jumlah per `physical_status`.
2. **Dampak pada Frontend:** Dashboard mengandalkan tipe opsional (`StaffDashboardSummary`) dengan fallback `"—"`, serta tidak menampilkan angka `AVAILABLE`/`BORROWED` jika unit >100 (`total_pages > 1`).
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Konfirmasi nama field resmi pada response `/staff/dashboard` dan `/komting/dashboard` (atau penambahan ringkasan agregat proyektor).
4. **Prioritas:** **HIGH**

### Gap 6: Daftar Field Resmi Koreksi Transaksi (`/admin/corrections`, §13.3, §20)
1. **Masalah:** `POST /api/v1/admin/transactions/{transaction_id}/corrections` masih berupa kerangka kontrak tanpa daftar field koreksi yang diizinkan, tipe transaksi target (`booking`/`loan`), serta aturan nilai baru.
2. **Dampak pada Frontend:** Halaman `/admin/corrections` baru menampilkan status kontrak ("Segera") dan form koreksi belum dapat dibuat.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Daftar whitelist `correction.field` per tipe transaksi dan aturan validasi nilainya.
4. **Prioritas:** **MEDIUM**

### Gap 7: `loan_id` pada Respons QR `RETURN` (§9.2)
1. **Masalah:** `POST /api/v1/staff/qr/validate` tidak mengembalikan `loan_id` pada objek `transaction` ketika `action === "RETURN"`.
2. **Dampak pada Frontend:** Frontend harus memanggil request tambahan `GET /api/v1/staff/loans?status=ACTIVE` untuk mencari `loan_id` yang cocok dengan `booking_id` sebelum masuk ke `/staff/loans/[id]/return`.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Konfirmasi penambahan `loan_id` opsional pada respons `RETURN` atau memastikan `GET /api/v1/staff/loans?status=ACTIVE` selalu memuat semua loan aktif pada halaman pertama (`page_size=50`).
4. **Prioritas:** **MEDIUM**

### Gap 8: Endpoint Detail Maintenance (`GET /api/v1/staff/maintenance/{maintenance_id}`, §11)
1. **Masalah:** Kontrak §11 hanya memiliki endpoint daftar `/staff/maintenance`, belum ada endpoint detail per `maintenance_id`.
2. **Dampak pada Frontend:** `StaffMaintenanceDetailView` harus memindai daftar maintenance secara berpaginasi (maks 10 halaman × 20 item); catatan yang lebih lama di luar batas halaman tidak akan ditemukan.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Penambahan `GET /api/v1/staff/maintenance/{maintenance_id}` atau dukungan filter `id`/`projector_id`.
4. **Prioritas:** **MEDIUM**

### Gap 9: Lookup Identitas Komting pada Model `Booking`/`Loan` & Detail Replacement (§4.4, §4.5, §6.7)
1. **Masalah:** `Booking` dan `Loan` hanya membawa `komting_id` (bukan nama komting/kelas), dan `KomtingApplication` replacement belum memodelkan data komting aktif sebelumnya maupun tenggat respons komting lama.
2. **Dampak pada Frontend:** Operasional STAFF dan dashboard menampilkan ID opaque (`komting_id`, `booking_id`) sebagai fallback; alur replacement hanya menampilkan data calon pengganti + peringatan konfirmasi ADMIN.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Keputusan apakah field tampilan minimum (`komting_name`, `class_name`, `booking_code`) disematkan di response operasional STAFF atau disediakan endpoint lookup aman.
4. **Prioritas:** **MEDIUM**

### Gap 10: Filter Lanjutan Audit Log & Struktur `details` Konflik/Error (§12.2, §13.1, §2.4)
1. **Masalah:** `GET /api/v1/admin/audit-logs` hanya mendukung `entity_type` dan `entity_id` (tanpa `actor_user_id`, `action`, `from`/`to`, maupun `actor_name`); aturan hitung `early_pickup_allowed_at` dan struktur `error.details` untuk `409 OPERATING_HOURS_CONFLICT` belum distandardisasi.
2. **Dampak pada Frontend:** Pencarian kata kunci di `/admin/audit-logs` bersifat lokal pada halaman dimuat saja; error konflik jam operasional hanya merender array `details` apa adanya.
3. **Keputusan/Info yang Dibutuhkan dari Backend:** Kepastian format `error.details` dan apakah filter audit log server akan diperluas.
4. **Prioritas:** **LOW**

---

## 8. Environment Readiness

- **Status Bagian:** **PARTIALLY READY**

Evaluasi konfigurasi pada `.env.example`, `src/lib/config/env.ts`, dan `next.config.ts`:

| Aspek | Kondisi Saat Ini | Penilaian | Tindakan yang Diperlukan |
|---|---|---|---|
| **`.env.example`** | Menyediakan `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`, `NEXT_PUBLIC_APP_TIMEZONE=Asia/Jakarta`, `NEXT_PUBLIC_USE_MOCK_API=true`. | **PARTIALLY READY** | Tambahkan variabel konfigurasi publik auth provider (mis. URL/anon key jika memakai Supabase Auth) setelah provider diputuskan. |
| **Development (`next dev`)** | Dapat menjalankan mock mode (`true`) maupun integrasi API lokal (`false` + `http://localhost:3001`). | **READY** | Pastikan backend dev aktif di URL yang sesuai saat menonaktifkan mock flag. |
| **Preview / Staging** | `NODE_ENV=production` pada build Next.js otomatis memaksa `env.useMockApi = false` walaupun `NEXT_PUBLIC_USE_MOCK_API=true`. | **PARTIALLY READY** | Wajib menyediakan backend staging yang aktif + `NEXT_PUBLIC_API_BASE_URL` preview saat build. |
| **Production (`next build`)** | `useMockApi` dikunci `false` di `env.ts`. Tidak ada secret atau service-role key di kode frontend. | **PARTIALLY READY** | Isi `NEXT_PUBLIC_API_BASE_URL` sebelum `next build` karena variabel `NEXT_PUBLIC_*` di-inline saat build-time oleh Next.js. |
| **CORS & HTTP Headers** | Frontend memanggil backend dengan `Authorization`, `Content-Type: application/json` / `multipart/form-data`, dan `Idempotency-Key`. | **Menunggu Konfigurasi Backend** | Backend wajib mengaktifkan CORS untuk origin frontend (dev/preview/prod) dengan `Access-Control-Allow-Headers` mencakup `Authorization, Content-Type, Idempotency-Key` dan methods `GET, POST, PUT, PATCH, OPTIONS`. |
| **Build-time vs Runtime** | `src/lib/config/env.ts` membaca `process.env.NEXT_PUBLIC_*` langsung. | **Catatan Penting** | Perubahan URL API pada deployment container/CDN memerlukan rebuild Next.js kecuali disalurkan lewat reverse proxy same-origin `/api/v1`. |

---

## 9. Integration Blockers

Daftar penghalang nyata sebelum integrasi end-to-end dapat berjalan penuh:

1. **[BLOCKER] Autentikasi Nyata Belum Terhubung (`AuthProviderAdapter`):** Mode real tidak dapat login, restore session, verifikasi email, maupun menyuplai Bearer token ke backend sebelum adapter provider nyata didaftarkan di `AppProviders` dan interceptor/refresh token disepakati.
2. **[BLOCKER/HIGH] Backend Endpoint & CORS Belum Tersinkronisasi pada Lingkungan Staging:** Seluruh endpoint prioritas (§5–§13) harus aktif dengan format envelope `{ data, meta }` / `{ error, meta }` serta header CORS `Authorization` & `Idempotency-Key`.
3. **[HIGH] Skema Baku `/staff/dashboard` & `/komting/dashboard` Belum Dikonfirmasi:** Tanpa kesepakatan field JSON, angka statistik operasional di `/staff` dan `/admin` akan menampilkan fallback `"—"`.
4. **[HIGH] Akses Privat Foto Identitas Komting Belum Ada di Kontrak:** Verifikasi pengajuan komting di `/admin/applications/[id]` terhambat karena ADMIN belum bisa melihat dokumen KRS/identitas pendaftar.
5. **[HIGH] Daftar Assignment Komting & Manajemen Akun STAFF Belum Memiliki Endpoint:** `/admin/assignments` (tabel) dan `/admin/staff` (CRUD) menunggu endpoint resmi backend.

---

## 10. Recommended Integration Sequence

Integrasi disarankan dilakukan bertahap tanpa mematikan alur pengembangan lain (tanpa menghapus `mockServices`):

1. **Fase 1 — Auth, Session, `/me`, & CORS Foundation (Prasyarat Mutlak)**
   - Sepakati auth provider (§20) dan konfigurasikan CORS backend.
   - Implementasikan dan daftarkan `AuthProviderAdapter` di `AppProviders` + tambahkan handling refresh token / `401`.
   - Verifikasi end-to-end `/login`, session restore, `/api/v1/me` (`GET` & `PATCH`), dan `RoleGuard` (`KOMTING`, `STAFF`, `ADMIN`).
2. **Fase 2 — Data Referensi & Jam Operasional**
   - Integrasikan `GET /api/v1/projectors`, `GET /api/v1/projectors/{id}`, `GET /api/v1/operating-hours`, `PUT /api/v1/admin/operating-hours/{date}`, dan `GET /api/v1/availability`.
   - Verifikasi timezone `Asia/Jakarta` dan handling `409 OPERATING_HOURS_CONFLICT`.
3. **Fase 3 — Alur Pendaftaran & Verifikasi Komting**
   - Integrasikan `POST /api/v1/komting/applications` (`multipart/form-data`), `/application/status`, serta endpoint ADMIN `/admin/komting/applications*` (`approve`, `reject`, `approve-replacement`, `deactivate`).
   - Tambahkan signed URL / endpoint privat foto identitas segera setelah backend menyediakannya.
4. **Fase 4 — Siklus Booking, QR Pickup, & Return Inspection**
   - Integrasikan `POST /api/v1/bookings` (`Idempotency-Key`), daftar/detail booking KOMTING & STAFF, `/komting/bookings/{id}/qr`, `/staff/qr/validate`, `pickup`, daftar/detail loan, dan `POST /staff/loans/{id}/return` (`FormData` + `Idempotency-Key`).
   - Verifikasi transisi atomik status `Booking` (`CONFIRMED -> FULFILLED`), `Loan` (`ACTIVE -> RETURNED`), dan `Projector` (`AVAILABLE -> BORROWED -> AVAILABLE/MAINTENANCE`).
5. **Fase 5 — Maintenance, Inventaris Admin, Audit Log, & Dashboard**
   - Integrasikan `POST/PATCH/deactivate` `/admin/projectors*`, `/staff/maintenance*`, `/admin/audit-logs*`, serta `/staff/dashboard` & `/komting/dashboard` setelah skema field dashboard dikonfirmasi.
6. **Fase 6 — Modul Kontrak Lanjutan (Pasca Finalisasi API Contract)**
   - Aktifkan tabel `/admin/assignments`, CRUD `/admin/staff`, dan form `/admin/corrections` setelah endpoint dan aturan field resmi dirilis di `API_CONTRACT_PINJAM.md`.

---

## 11. Acceptance Criteria

Integrasi backend-frontend dinyatakan siap untuk dirilis bertahap jika seluruh kriteria berikut terpenuhi:

- [ ] `AuthProviderAdapter` nyata terdaftar di `AppProviders`; login, session persistence saat reload, token refresh/expired handling, dan logout berjalan dengan `NEXT_PUBLIC_USE_MOCK_API=false`.
- [ ] `GET /api/v1/me` dan `RoleGuard` memetakan role (`KOMTING`, `STAFF`, `ADMIN`) serta `account_status` dari backend tanpa error `AUTH_PROVIDER_NOT_CONFIGURED`.
- [ ] Backend mengembalikan response sukses `{ data, meta: { request_id, pagination? } }` dan error `{ error: { code, message, details? }, meta }` sesuai `API_CONTRACT_PINJAM.md` §2.3–2.4.
- [ ] Header CORS mengizinkan origin frontend, `Authorization`, `Content-Type`, dan `Idempotency-Key`.
- [ ] Upload `multipart/form-data` pada pendaftaran komting dan return inspection berhasil disimpan oleh backend dan validasi foto rusak/tidak lengkap berjalan.
- [ ] Idempotency retry pada `createBooking`, `confirmPickup`, `confirmReturn`, dan `approveReplacement` menghasilkan perilaku server yang aman (tidak menduplikasi transaksi).
- [ ] Skema field `/staff/dashboard` dan `/komting/dashboard` terverifikasi sehingga KPI dashboard tampil akurat (atau `"—"` jika opsional, tanpa `0` palsu).
- [ ] Seluruh pengujian frontend (`npm test`), `npm run typecheck`, `npm run lint`, dan `npm run build` tetap lulus tanpa error dengan mock dimatikan di build production.

---

## 12. Final Readiness Assessment

- **Status Akhir:** **PARTIALLY READY**
- **Ringkasan Penilaian per Domain:**

| Domain | Status | Ringkasan |
|---|---|---|
| Frontend Architecture & Service Layer | **READY** | Abstraksi `services`, validasi, state UI (loading/empty/error/retry), dan build static/dynamic route lengkap (`27` static, `7` dynamic routes, `92` test lulus). |
| API Client (`src/lib/api/client.ts`) | **PARTIALLY READY** | Envelope, Bearer token, `Idempotency-Key`, timeout, dan `FormData` siap; kurang mekanisme auto-refresh token `401` dan mapping HTTP status non-JSON selain `401`/`403`. |
| Authentication & Session | **NOT READY** | Menunggu registrasi implementasi `AuthProviderAdapter` nyata dan strategi refresh token. |
| Core Operations (Projector, Booking, QR, Return, Maintenance, Hours, Audit Log) | **READY / PARTIALLY READY** | Siap beralih melalui `env` setelah Fase 1 (Auth) terhubung dan skema dashboard/konflik dikonfirmasi. |
| Extended Admin Modules (Assignments List, STAFF CRUD, Identity Photo, Corrections) | **NOT READY** | Diblokir oleh gap pada `API_CONTRACT_PINJAM.md` v1.0.0; UI menampilkan status gap kontrak secara transparan tanpa endpoint/data fiktif. |

**Kesimpulan:** Frontend sudah matang dari sisi UI, tipe data kontrak, proteksi role sisi klien, penanganan idempotensi, dan pemisahan mock/real service. Langkah implementasi terdekat adalah menyepakati **Auth Provider** dan **CORS + `/api/v1/me`** bersama tim backend agar integrasi Fase 1 dapat segera dimulai.
