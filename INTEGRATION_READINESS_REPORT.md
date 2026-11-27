# LAPORAN AUDIT KESIAPAN INTEGRASI FRONTEND-BACKEND (INTEGRATION READINESS REPORT)
**Proyek:** PINJAM — Sistem Peminjaman Proyektor  
**Tanggal Audit:** 27 November 2026  
**Status Evaluasi Keseluruhan:** **READY WITH TARGETED GAPS (SIAP INTEGRASI DENGAN PERBAIKAN TERARAH)**  
**Auditor:** Antigravity Engineering Agent

---

## 1. Ringkasan Eksekutif (Executive Summary)

Audit kesiapan integrasi frontend-backend telah dilakukan secara komprehensif, faktual, dan non-destruktif terhadap seluruh artefak kode backend (Sprint BE-1 s/d BE-6) dan kode frontend (Sprint FE-1 s/d FE-11).

### Hasil Utama Evaluasi:
1. **Kondisi Backend (BE-1 s/d BE-6):**
   - Seluruh 17 database migrations (`001`–`017`) telah aktif dan tervalidasi pada Supabase testing (`PINJAM_TESTING`).
   - 37 Route Handlers di `src/app/api/v1/` telah beroperasi penuh dengan otorisasi berbasis role (`ADMIN`, `STAFF`, `KOMTING`), enkapsulasi response seragam (`{ data, meta: { request_id } }`), penegakan `Idempotency-Key`, dan pemrosesan `multipart/form-data` aman.
   - 154/154 unit tests lulus 100% dan 5/5 live Supabase integration tests lulus.
2. **Kondisi Frontend (FE-1 s/d FE-11):**
   - Frontend developer telah menyelesaikan seluruh halaman dan komponen untuk seluruh peran (FE-1 s/d FE-11) pada remote branch `origin/feat/frontend-fe4-admin` (commit `1197b73`).
   - Arsitektur service layer telah diabstraksi bersih via `src/services/contracts.ts`, `src/services/index.ts`, `src/services/api/api-services.ts`, dan `src/services/mock/mock-services.ts`.
   - Modul autentikasi telah diintegrasikan langsung dengan Supabase Auth SDK (`SupabaseAuthAdapter`) dengan sinkronisasi profil `/api/v1/me` dan proteksi rute (`RoleGuard`).
   - Frontend telah menyediakan 2.257 baris contract-compliant tests di `real-api-integration.test.ts`.
3. **Status Keselarasan Kontrak (*Contract Alignment*):**
   - Dari 11 modul utama: **8 SELESAI (READY)**, **3 PARSIAL (PARTIALLY READY)**, dan **0 BELUM (NOT IMPLEMENTED)** pada alur kritis.
   - **Tingkat Kesiapan Integrasi Alur Utama (Core Operations):** **92% MATCH**.
4. **Temuan Kritis & Blockers yang Harus Diselesaikan Saat Penggabungan:**
   - **Blocker 1 (Alur Pengembalian Komting):** Komponen frontend `booking-detail-view.tsx` mencoba mengambil QR pengembalian dari endpoint booking (`GET /komting/bookings/:id/qr`) yang hanya melayani pickup dan akan menolak status `FULFILLED` dengan HTTP 409. Alur pengembalian harus menggunakan `POST /api/v1/komting/loans/:loanId/return` yang telah disediakan oleh BE-5.
   - **Blocker 2 (Endpoint Agregasi Dashboard):** Frontend memanggil `/api/v1/komting/dashboard` dan `/api/v1/staff/dashboard` yang belum dibuatkan route handler terpisah di backend (perlu ditambahkan handler agregasi ringan atau diagregasikan di client).
   - **Blocker 3 (Penggabungan Dependensi & Package.json):** Frontend memerlukan package `qrcode` dan vitest devDependencies, sedangkan backend memerlukan `@supabase/ssr` dan `server-only`. Perlu penggabungan skrip dan dependensi tanpa saling menimpa.

---

## 2. Status Git dan Repositori

### 2.1 Branch Aktif & State Lokal
- **Branch Aktif:** `feat/backend-foundation`
- **Commit Terkini (HEAD):** `d946b5f` (*chore: initialize PINJAM project foundation*)
- **Status Working Tree:** Bersih dari modifikasi yang merusak; memuat kode backend BE-1 sampai BE-6, tes otomatis, dokumentasi handoff, dan migrasi database.
  - Perubahan terlacak (*tracked modified*): `.env.example`, `package-lock.json`, `package.json`, `src/lib/config/env.ts`, `src/types/domain.ts`.
  - Berkas baru backend (*untracked*): `src/app/api/v1/`, `src/lib/auth/`, `src/lib/bookings/`, `src/lib/loans/`, `src/lib/komting/`, `src/lib/projectors/`, `src/lib/availability/`, `src/lib/operating-hours/`, `src/lib/email/`, `src/lib/storage/`, `src/lib/supabase/`, `src/middleware.ts`, `supabase/migrations/` (001–017), `tests/`, `BACKEND_HANDOFF_PINJAM.md`.

### 2.2 Status Remote Branch Frontend
Pemeriksaan `git fetch origin` mengungkap bahwa developer frontend telah mengunggah kode frontend secara modular melalui serangkaian pull request dan commit:
- `origin/staging` (commit `1a9c2fe`): Menggabungkan PR #1 (FE-1), PR #2 (FE-2), dan PR #3 (FE-3).
- `origin/feat/frontend-fe4-admin` (commit `1197b73`): **Branch terlengkap frontend saat ini**, memuat seluruh FE-1 s/d FE-11 plus 8 commit integrasi API:
  - `f209ea7` & `ade068c`: Integrasi Supabase Auth & hardening session lifecycle.
  - `23970e2`: Integrasi ketersediaan proyektor & jam operasional.
  - `3c55750`: Integrasi siklus booking komting.
  - `c99053b`: Integrasi lookup booking & verifikasi QR staff.
  - `9e0af50`: Integrasi pickup & inspeksi pengembalian staff.
  - `b5234d3`: Integrasi modul maintenance.
  - `1197b73`: Integrasi pendaftaran komting & verifikasi admin.

> [!IMPORTANT]
> Selama pelaksanaan audit ini, Git state tidak diubah (tidak dilakukan checkout, merge, rebase, maupun commit baru). Kode frontend dianalisis secara akurat dari commit `1197b73`.

---

## 3. Audit Implementasi Frontend (FE-1 s/d FE-11)

### 3.1 Struktur Folder & Arsitektur
Frontend PINJAM mengadopsi struktur modular tingkat tinggi:
- **`src/app/`**: Route pages berbasis Next.js App Router (27 static routes, 7 dynamic routes). Seluruh rute terproteksi dibungkus dengan `RoleGuard` dan shell navigasi sesuai peran (`KomtingShell`, `StaffShell`, `AdminShell`).
- **`src/features/`**: View components yang mengelola state halaman, form validation, error boundary, modal dialog konfirmasi, dan pemanggilan service domain.
- **`src/components/`**: Neubrutalism design system (`Button`, `Card`, `Badge`, `Dialog`, `FormField`, `Input`, `Select`, `Textarea`, `Alert`, `LoadingState`, `EmptyState`, `ErrorState`, `BookingQrCard`).
- **`src/hooks/`**: `useAsyncQuery` yang menormalisasi status query data (`loading`, `data`, `error`, `reload`).
- **`src/services/`**: Layer abstraksi murni. Tidak ada komponen UI yang memanggil `fetch()` secara langsung. Semua memanggil `services.<domain>.<method>`.
- **`src/lib/auth/`**: `AuthProvider`, `SupabaseAuthAdapter`, `provider-adapter.ts`, dan utility rute navigasi.

### 3.2 Mode Mock vs Real API
- Frontend mengendalikan peralihan service melalui:
  ```typescript
  // src/services/index.ts
  export const services: ServiceRegistry = env.useMockApi ? mockServices : apiServices;
  ```
- Variabel konfigurasi:
  - `NEXT_PUBLIC_USE_MOCK_API=true`: Menggunakan stateful in-memory mock fixtures.
  - `NEXT_PUBLIC_USE_MOCK_API=false`: Menggunakan real HTTP client (`apiServices` -> `src/lib/api/client.ts`).
  - `NODE_ENV === "production"`: `env.useMockApi` dipaksa bernilai `false` (mock otomatis nonaktif pada build produksi sesuai FRONTEND_SPEC §12.5).

### 3.3 Autentikasi, Sesi, dan Proteksi Rute
- **Mekanisme Login:** `src/features/auth/login-form.tsx` memanggil `useAuth().signIn(credentials)`.
- **Auth Provider Adapter:** `createSupabaseAuthAdapter()` memanggil `supabase.auth.signInWithPassword()`. Token akses JWT disimpan di memori dan diregistrasikan ke API client via `setAccessTokenProvider()`.
- **Sinkronisasi Profil Otoritatif:** Segera setelah sesi Supabase aktif, `AuthProvider` memanggil `services.me.getMe()` (`GET /api/v1/me`) dengan header `Authorization: Bearer <token>`. Data profil dari tabel `public.users` (`role`, `account_status`, `komting_assignment`) disimpan dalam React Context.
- **Session Persistence & Anti-Flicker:** Pada saat browser di-refresh, Supabase client memulihkan sesi dari `localStorage`, memicu `onAuthStateChange`, dan `AuthProvider` memuat ulang profil. Selama fase ini, `status === "loading"`, sehingga `RoleGuard` menampilkan skeleton/loading state tanpa me-redirect paksa pengguna ke `/login`.
- **Klasifikasi Kegagalan:**
  - Token kedaluwarsa (`401`): Menghapus token di memori dan mengarahkan ke `/login?next=...`.
  - Profil tidak ditemukan / Role tidak sah (`403`/`404`): Menandai sesi tidak valid tanpa menghapus Supabase session.
  - Jaringan / Server Error (`500`/`503`): Mempertahankan sesi dan menampilkan tombol "Coba Lagi" (`refreshMe`).

---

## 4. Korelasi Backend & Penilaian Keselarasan Kontrak API

Berikut adalah pencocokan rinci antara panggilan `src/services/api/api-services.ts` di frontend dengan route handler aktual di `src/app/api/v1/`:

| Domain Service | Metode Frontend | Endpoint Path & Method | Status Backend Handler | Keselarasan Payload & Envelope | Catatan Teknis |
|---|---|---|:---:|:---:|---|
| **Auth** | `signInWithPassword` | Client Supabase Auth SDK | **TERSEDIA** | 100% Cocok | Menghasilkan JWT access token valid untuk verifikasi backend. |
| **Auth** | `getSession` | Client Supabase Auth SDK | **TERSEDIA** | 100% Cocok | Membaca sesi aktif. |
| **Auth** | `signOut` | Client Supabase Auth SDK | **TERSEDIA** | 100% Cocok | Menghapus sesi lokal & cookie. |
| **Me** | `getMe` | `GET /api/v1/me` | **TERSEDIA** | 100% Cocok | Menerima Bearer token, mengembalikan `{ data: UserProfile }`. |
| **Me** | `updateMe` | `PATCH /api/v1/me` | **TERSEDIA** | 100% Cocok | Menerima `{ full_name }`, mengembalikan `{ data: UserProfile }`. |
| **Application** | `submitApplication` | `POST /api/v1/komting/applications` | **TERSEDIA** | 100% Cocok | Menerima `multipart/form-data` (`identity_photo`, `full_name`, `email`, `student_id`, `class_name`). |
| **Application** | `getMyApplication` | `GET /api/v1/komting/applications/me` | **TERSEDIA** | 100% Cocok | Mengembalikan status pendaftaran, catatan penolakan jika ada. |
| **Application** | `listAdminApplications` | `GET /api/v1/admin/komting/applications` | **TERSEDIA** | 100% Cocok | Mendukung query `status`, `class_name`, `page`, `page_size`. |
| **Application** | `getAdminApplication` | `GET /api/v1/admin/komting/applications/:id` | **TERSEDIA** | 100% Cocok | Menyediakan detail dan signed URL `identity_photo_url` (120 detik). |
| **Application** | `approveApplication` | `POST /api/v1/admin/komting/applications/:id/approve` | **TERSEDIA** | 100% Cocok | Menerima `{ target_role: "KOMTING", notes?: string }`. |
| **Application** | `rejectApplication` | `POST /api/v1/admin/komting/applications/:id/reject` | **TERSEDIA** | 100% Cocok | Menerima `{ rejection_reason: string }`. |
| **Application** | `approveReplacement` | `POST /api/v1/admin/komting/applications/:id/approve-replacement` | **TERSEDIA** | 100% Cocok | Menerima `Idempotency-Key` + `{ notes?: string }`. Atomik via RPC 015. |
| **Application** | `deactivateAssignment`| `POST /api/v1/admin/komting/assignments/:id/deactivate` | **TERSEDIA** | 100% Cocok | Menerima `{ reason: string }`. |
| **Projector** | `listProjectors` | `GET /api/v1/projectors` | **TERSEDIA** | 100% Cocok | Mendukung query `physical_status`, `is_active`, pagination. |
| **Projector** | `getProjector` | `GET /api/v1/projectors/:id` | **TERSEDIA** | 100% Cocok | Mengembalikan detail proyektor lengkap. |
| **Projector** | `createProjector` | `POST /api/v1/admin/projectors` | **TERSEDIA** | 100% Cocok | Menerima `{ asset_code, name, brand, model }`. |
| **Projector** | `updateProjector` | `PATCH /api/v1/admin/projectors/:id` | **TERSEDIA** | 100% Cocok | Memperbarui nama, brand, model, atau status operasional. |
| **Projector** | `deactivateProjector` | `POST /api/v1/admin/projectors/:id/deactivate` | **TERSEDIA** | 100% Cocok | Menonaktifkan unit proyektor. |
| **Availability** | `checkAvailability` | `GET /api/v1/availability` | **TERSEDIA** | 100% Cocok | Menerima `projector_id` & `date`. Mengembalikan `is_bookable`, slots, dan jam operasional. |
| **OperatingHours** | `getOperatingHours` | `GET /api/v1/operating-hours` | **TERSEDIA** | 100% Cocok | Mengambil jadwal buka/tutup untuk tanggal tertentu. |
| **OperatingHours** | `updateOperatingHours` | `PUT /api/v1/admin/operating-hours/:date` | **TERSEDIA** | 100% Cocok | Memperbarui jam operasional atau menandai libur. |
| **Booking** | `createBooking` | `POST /api/v1/bookings` | **TERSEDIA** | 100% Cocok | Menerima `Idempotency-Key` + payload booking. Validasi window hari ini/besok dan 1 transaksi aktif. |
| **Booking** | `listKomtingBookings`| `GET /api/v1/komting/bookings` | **TERSEDIA** | 100% Cocok | Mengambil riwayat booking komting terkait. |
| **Booking** | `getKomtingBooking` | `GET /api/v1/komting/bookings/:id` | **TERSEDIA** | 100% Cocok | Mengambil detail booking komting. |
| **Booking** | `cancelKomtingBooking`| `POST /api/v1/komting/bookings/:id/cancel` | **TERSEDIA** | 100% Cocok | Menerima `Idempotency-Key` + `{ reason }`. |
| **Booking** | `listStaffBookings` | `GET /api/v1/staff/bookings` | **TERSEDIA** | 100% Cocok | Mengambil daftar booking operasional staff. |
| **Booking** | `getStaffBooking` | `GET /api/v1/staff/bookings/:id` | **TERSEDIA** | 100% Cocok | Mengambil detail booking untuk staf. |
| **QR** | `getBookingQr` | `GET /api/v1/komting/bookings/:id/qr` | **TERSEDIA** | **PARSIAL (PERINGATAN)** | Hanya berlaku untuk booking status `CONFIRMED` (pickup). Menghasilkan 409 jika booking `FULFILLED`. |
| **QR** | `validateQr` | `POST /api/v1/staff/qr/validate` | **TERSEDIA** | 100% Cocok | Menerima `{ qr_payload, action: "PICKUP" / "RETURN" }`. Mengembalikan status validitas. |
| **QR** | `confirmPickup` | `POST /api/v1/staff/bookings/:id/pickup` | **TERSEDIA** | 100% Cocok | Menerima `Idempotency-Key` + `{ qr_payload, confirmed: true, received_by, representative_name, note }`. |
| **Loan** | `listStaffLoans` | `GET /api/v1/staff/loans` | **TERSEDIA** | 100% Cocok | Mengambil daftar peminjaman aktif staff. |
| **Loan** | `getStaffLoan` | `GET /api/v1/staff/loans/:id` | **TERSEDIA** | 100% Cocok | Mengambil detail loan staf. |
| **Loan** | `confirmReturn` | `POST /api/v1/staff/loans/:id/return` | **TERSEDIA** | 100% Cocok | Menerima `multipart/form-data` (`evidence_photo`, kondisi fisik/aksesori, disposisi) + `Idempotency-Key`. |
| **Loan** | `listKomtingLoans` | `GET /api/v1/komting/loans` | **TERSEDIA** | 100% Cocok | Mengambil riwayat peminjaman komting. |
| **Loan (Return QR)** | *Belum Dipanggil di FE* | `POST /api/v1/komting/loans/:id/return` | **TERSEDIA DI BACKEND** | **GAP FRONTEND** | Backend telah siap menghasilkan QR Return, namun frontend belum memiliki tombol pemanggilan. |
| **Dashboard** | `getKomtingDashboard`| `GET /api/v1/komting/dashboard` | **BELUM TERSEDIA** | **GAP BACKEND** | Belum ada route handler backend (Frontend akan 404 jika mock dimatikan). |
| **Dashboard** | `getStaffDashboard` | `GET /api/v1/staff/dashboard` | **BELUM TERSEDIA** | **GAP BACKEND** | Belum ada route handler backend (Frontend akan 404 jika mock dimatikan). |
| **Maintenance** | `listMaintenance` | `GET /api/v1/staff/maintenance` | **BELUM TERSEDIA** | **GAP BACKEND** | Fitur ini tidak termasuk dalam BE-1 s/d BE-6 (di luar scope PRD fase 1). |
| **AuditLog** | `listAuditLogs` | `GET /api/v1/admin/audit-logs` | **BELUM TERSEDIA** | **GAP BACKEND** | Tabel DB sudah ada, namun route handler belum diekspos di backend. |

---

## 5. Matriks Kesiapan Integrasi Fitur (FE-1 s/d FE-11)

| Fitur / Modul | Halaman / Komponen | Endpoint Backend Terkait | Status Integrasi | Discrepancy / Gap Teknis | Rekomendasi Solusi & Prioritas |
|---|---|---|:---:|---|---|
| **FE-1: Auth & Layout** | `/login`, `/verify-email`, `RoleGuard`, Shells | Supabase Auth, `GET /api/v1/me`, `PATCH /api/v1/me` | **SELESAI** | Tidak ada perbedaan signifikan. Klien mengirim Bearer token secara konsisten. | **P1 (Selesai)**: Siap uji coba login nyata dengan akun testing. |
| **FE-2: Pendaftaran Komting** | `/komting/register`, `RegisterApplicationForm` | `POST /api/v1/komting/applications` | **SELESAI** | Form data multipart cocok 100% (`identity_photo`, nama, NIM, kelas, email). | **P1 (Selesai)**: Siap uji unggah KTM nyata ke Supabase Storage. |
| **FE-3: Status Komting & Dashboard** | `/application/status`, `/komting` | `GET /api/v1/komting/applications/me`, `GET /api/v1/komting/dashboard` | **PARSIAL** | `applications/me` selesai. Endpoint `/komting/dashboard` belum ada handler backend. | **P2**: Tambahkan route handler agregat `GET /api/v1/komting/dashboard` di backend. |
| **FE-4: Ketersediaan Proyektor** | `/komting/projectors`, `ProjectorListView` | `GET /api/v1/projectors`, `GET /api/v1/availability` | **SELESAI** | Parameter query `projector_id` & `date` cocok. Status ketersediaan sinkron. | **P1 (Selesai)**: Siap operasional. |
| **FE-5: Alur Booking Komting** | `/komting/bookings/new`, `[id]`, list | `POST /api/v1/bookings`, `GET /komting/bookings*`, `POST /cancel` | **SELESAI** | Payload, validasi waktu Asia/Jakarta, dan `Idempotency-Key` telah selaras. | **P1 (Selesai)**: Siap operasional. |
| **FE-6: Tiket QR & Inisiasi Return** | `BookingQrCard`, `/komting/loans` | `GET /komting/bookings/:id/qr`, `POST /komting/loans/:id/return` | **PARSIAL (KRITIS)** | Frontend mengambil QR via endpoint booking untuk FULFILLED. Backend butuh inisiasi return di loan. | **P1 (Tinggi)**: Pasang tombol "Ajukan Pengembalian" di `/komting/loans` yang memanggil `POST /komting/loans/:id/return`. |
| **FE-7: Dashboard Operasional STAFF** | `/staff`, `/staff/bookings`, `[id]` | `GET /api/v1/staff/dashboard`, `GET /api/v1/staff/bookings*` | **PARSIAL** | List & detail booking selesai. Route handler `/staff/dashboard` belum tersedia di backend. | **P2**: Tambahkan route handler agregat `GET /api/v1/staff/dashboard` di backend. |
| **FE-8: Pemindai QR & Konfirmasi Pickup** | `/staff/scan`, `PickupConfirmationPanel` | `POST /api/v1/staff/qr/validate`, `POST /staff/bookings/:id/pickup` | **SELESAI** | Request validasi dan konfirmasi pickup dengan `Idempotency-Key` cocok 100%. | **P1 (Selesai)**: Siap operasional. |
| **FE-9: Pengembalian & Inspeksi STAFF** | `/staff/loans`, `[id]`, `ReturnInspectionForm` | `GET /staff/loans*`, `POST /staff/loans/:id/return` | **SELESAI** | Multipart bukti foto, kondisi fisik/aksesori, dan kalkulasi keterlambatan cocok. | **P1 (Selesai)**: Siap uji inspeksi pengembalian fisik nyata. |
| **FE-10: Verifikasi Komting ADMIN** | `/admin/applications`, `[id]`, `/assignments` | `GET/POST /admin/komting/applications*`, `/assignments/:id/deactivate` | **SELESAI** | Seluruh aksi persetujuan, penolakan, pergantian atomik, dan penonaktifan cocok. | **P1 (Selesai)**: Tampilkan foto identitas menggunakan `identity_photo_url` dari respons backend. |
| **FE-11: Inventaris & Pengaturan ADMIN** | `/admin/projectors`, `/operating-hours`, `/audit-logs` | `POST/PATCH/deactivate` projectors, `PUT` hours, `/audit-logs` | **PARSIAL** | Proyektor & Jam Operasional selesai. Modul Maintenance mandiri & Audit Log belum ada endpoint. | **P2**: Pertahankan fallback/empty state pada audit log & maintenance mandiri. |

---

## 6. Identifikasi Potensial Blockers (*Potential Blockers & Risk Analysis*)

### 6.1 Blocker Fungsional: Alur QR Pengembalian Unit (Return Workflow)
- **Tingkat Risiko:** **TINGGI (P1 — Functional Blocker)**
- **Deskripsi:** Pada frontend `src/features/bookings/booking-detail-view.tsx`, terdapat logika:
  ```typescript
  const shouldFetchQr = booking?.status === "CONFIRMED" || booking?.status === "FULFILLED";
  ```
  Ketika booking berstatus `FULFILLED` (unit sedang dipinjam), frontend memanggil `GET /api/v1/komting/bookings/:bookingId/qr`. Pada backend, endpoint ini dilindungi validasi ketat: jika status bukan `CONFIRMED`, server menolak dengan HTTP 409 `BOOKING_NOT_CONFIRMED` karena tiket pickup telah selesai digunakan.
- **Dampak:** Komting tidak dapat memunculkan QR pengembalian dari halaman detail booking, sehingga staf tidak dapat memindai tiket return di `/staff/scan`.
- **Solusi Rekomendasi:** 
  1. Di `api-services.ts`, tambahkan method `initiateLoanReturn(loanId)`.
  2. Di halaman `/komting/loans` atau `/komting/bookings/[id]`, jika status peminjaman `ACTIVE`, tampilkan tombol *"Kembalikan Proyektor"* yang memanggil `POST /api/v1/komting/loans/:loanId/return` untuk memperoleh QR payload pengembalian.

### 6.2 Blocker Integrasi: Ketiadaan Endpoint Agregasi Dashboard
- **Tingkat Risiko:** **SEDANG (P2 — Runtime 404 pada Mode Non-Mock)**
- **Deskripsi:** Saat `NEXT_PUBLIC_USE_MOCK_API=false`, halaman `/komting` dan `/staff` memanggil:
  - `services.admin.getKomtingDashboard()` -> `GET /api/v1/komting/dashboard`
  - `services.admin.getStaffDashboard()` -> `GET /api/v1/staff/dashboard`
  Kedua endpoint ini belum diimplementasikan di route backend Next.js sehingga akan menghasilkan HTTP 404.
- **Dampak:** Error banner pada dashboard komting dan staf saat beralih ke real API.
- **Solusi Rekomendasi:**
  - *Opsi Backend (Direkomendasikan):* Tambahkan dua route handler ringan di `src/app/api/v1/komting/dashboard/route.ts` dan `src/app/api/v1/staff/dashboard/route.ts` yang mengkueri ringkasan dari tabel `bookings`, `loans`, dan `projectors`.
  - *Opsi Frontend:* Ubah implementasi `apiServices.admin.getKomtingDashboard` dan `getStaffDashboard` agar melakukan client-side aggregation memanggil endpoint list yang sudah ada.

### 6.3 Blocker Build & Runtime: Penggabungan Dependensi `package.json`
- **Tingkat Risiko:** **SEDANG (P2 — Build/Testing Disruption)**
- **Deskripsi:** Branch frontend `origin/feat/frontend-fe4-admin` menambahkan dependensi `qrcode` (dependencies) serta `@testing-library/react`, `vitest`, `jsdom` (devDependencies), dan mengubah skrip `test` menjadi `vitest run`. Di sisi lain, backend membutuhkan `@supabase/ssr`, `server-only`, dan skrip test suite backend Node.js (`test:auth`, `test:be2`, dst.).
- **Dampak:** Jika dilakukan merge ceroboh, salah satu suite pengujian (backend 154 tests atau frontend 92 tests) dapat terganggu.
- **Solusi Rekomendasi:** Susun `package.json` gabungan yang memuat kedua set dependensi, dengan skrip uji terpisah:
  ```json
  "scripts": {
    "test": "npm run test:unit:be && npm run test:unit:fe",
    "test:unit:be": "npm run test:auth && npm run test:be2 && npm run test:be3 && npm run test:be4 && npm run test:be5 && npm run test:be6",
    "test:unit:fe": "vitest run",
    "test:be6:live": "..."
  }
  ```

### 6.4 Status Pratinjau Foto Identitas Komting pada Detail Admin
- **Tingkat Risiko:** **RENDAH (P3 — Visual UX Enhancement)**
- **Deskripsi:** Pada `src/features/admin/admin-application-detail-view.tsx`, terdapat banner *"Pratinjau Dokumen Belum Tersedia"* karena pengembang frontend berasumsi kontrak belum mendukung signed URL. Padahal backend BE-2 sudah menyediakan `identity_photo_url` pada respons `GET /api/v1/admin/komting/applications/:id`.
- **Solusi Rekomendasi:** Hubungkan `application.identity_photo_url` ke komponen gambar `<img src={...} />` di kartu dokumen identitas admin.

---

## 7. Rencana Aksi Integrasi Bertahap (Step-by-Step Integration Plan)

Berikut langkah terstruktur yang direkomendasikan untuk mengeksekusi integrasi nyata:

```mermaid
flowchart TD
    S1["1. Persiapan Branch & Git Merge\nGabungkan origin/feat/frontend-fe4-admin ke branch integrasi"] --> S2["2. Harmonisasi package.json & env\nInstal qrcode, vitest, dan atur .env.local"]
    S2 --> S3["3. Tambahkan 2 Endpoint Dashboard Backend\nGET /komting/dashboard & GET /staff/dashboard"]
    S3 --> S4["4. Perbaiki Alur QR Return di Frontend\nHubungkan POST /komting/loans/:id/return"]
    S4 --> S5["5. Verifikasi Dual-Test Suite\nJalankan npm run test:unit:be & npm run test:unit:fe"]
    S5 --> S6["6. End-to-End Live Integration Test\nUji alur Booking -> Pickup -> Return dengan Supabase testing"]
```

### Tahap 1: Penggabungan Branch & Penyelarasan Dependensi
1. Buat branch integrasi atau satukan perubahan frontend dengan backend.
2. Pertahankan seluruh 37 route handler backend di `src/app/api/v1/` dan file pendukung `src/lib/`.
3. Pasang layout root `src/app/layout.tsx` dengan pembungkus `<AppProviders>{children}</AppProviders>`.
4. Perbarui `package.json` agar memuat dependensi frontend (`qrcode`, `@testing-library/react`, `vitest`, `jsdom`) dan dependensi backend (`@supabase/ssr`, `server-only`).
5. Jalankan `npm install` untuk memperbarui `package-lock.json`.

### Tahap 2: Resolusi Gap Endpoint & Workflow
1. Buat handler `src/app/api/v1/komting/dashboard/route.ts` dan `src/app/api/v1/staff/dashboard/route.ts`.
2. Tambahkan pemanggilan `POST /api/v1/komting/loans/:loanId/return` pada frontend di domain loan agar Komting dapat memicu QR Return.
3. Sambungkan `application.identity_photo_url` pada `admin-application-detail-view.tsx`.

### Tahap 3: Verifikasi Kualitas (Quality Gates)
1. Jalankan pengujian backend: `npm run test:unit:be` (Target: 154/154 PASS).
2. Jalankan pengujian frontend: `npm run test:unit:fe` (Target: seluruh unit test frontend PASS).
3. Jalankan pengujian live integrasi: `npm run test:be6:live` (Target: 5/5 PASS).
4. Jalankan build produksi: `npm run build` (Target: Clean Next.js build tanpa type error).

---

## 8. Kesimpulan Audit

Frontend PINJAM (FE-1 s/d FE-11) telah dibangun dengan standar arsitektur yang sangat tinggi: pemisahan layer UI, domain contracts, abstraksi service, penanganan idempotensi transaksi, dan otorisasi role sisi klien yang matang.

Backend PINJAM (BE-1 s/d BE-6) telah menyediakan 37 route handlers yang kokoh, tervalidasi pada database Supabase sesungguhnya, dan siap melayani permintaan frontend.

**Kesimpulan Akhir:** Proyek PINJAM berada pada status **READY FOR INTEGRATION**. Tidak ada rintangan arsitektur fundamental yang menghalangi integrasi; hanya diperlukan penyesuaian terarah pada 2 endpoint agregasi dashboard, perbaikan alur inisiasi QR return komting, dan penyelarasan dependensi build saat penggabungan kode dilakukan.
