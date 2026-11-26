# PROJECT CONTEXT — PINJAM

- **Terakhir Diperbarui:** 26 November 2026
- **Sprint Terakhir:** Sprint FE-4.5 — ADMIN Operating Hours Management
- **Branch Frontend Aktif:** `feat/frontend-fe4-admin` (dibuat dari `staging` pasca merge FE-3 `1a9c2fe`)
- **Acuan Utama:**
1. `PRD_PINJAM_FINAL.md` (v2.0.0)
2. `API_CONTRACT_PINJAM.md` (v1.0.0)
3. `FRONTEND_SPEC_PINJAM.md` (v1.0.0)
4. `BACKEND_SPEC_PINJAM.md` (v1.0.0)

---

## 1. Ringkasan Proyek

**PINJAM** adalah sistem informasi pengelolaan pengajuan komting, booking, peminjaman (loan), pengembalian (return inspection), inventaris, dan maintenance proyektor.

Aturan domain inti dari PRD:
- Hanya komting aktif dan terverifikasi yang dapat membuat booking; satu kelas maksimal memiliki satu komting aktif dan satu komting hanya mewakili satu kelas aktif.
- Tiga status dipisahkan secara tegas: status fisik unit (`projectors.physical_status`), status reservasi (`bookings.status`), dan status transaksi serah-terima (`loans.status`).
- Lewatnya estimasi pengembalian tidak otomatis mengubah status unit `BORROWED` menjadi `AVAILABLE`; unit baru tersedia setelah STAFF/ADMIN mengonfirmasi pengembalian dan kelayakan unit.
- Zona waktu operasional adalah `Asia/Jakarta`, sedangkan timestamp komunikasi API menggunakan ISO 8601 UTC.
- Backend adalah sumber kebenaran untuk autentikasi, otorisasi, ketersediaan, status transaksi, dan seluruh business rules.

---

## 2. Teknologi yang Digunakan

- **Framework:** Next.js `^16.4.6` (App Router)
- **UI Library:** React `^19.3.1` & React DOM `^19.3.1`
- **Bahasa:** TypeScript `^5.8.3` (`strict: true`, `noUncheckedIndexedAccess: true`)
- **Styling:** Tailwind CSS `^4.3.5` (`@tailwindcss/postcss`) + CSS Custom Properties (`src/styles/tokens.css`)
- **Typography:** `Plus Jakarta Sans` (body), `Space Grotesk` (headings), `JetBrains Mono` (kode aset/booking/token) via `next/font/google`
- **QR Rendering:** `qrcode` (`^1.5.x`, `@types/qrcode`) untuk merender SVG QR dari token opaque backend
- **Lint & Format:** ESLint `^9.25.0` (`eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`) & Prettier `^3.5.3`
- **Testing:** Vitest `5.1.2`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
- **Runtime Toolchain:** Node.js `v24.14.0`, npm `11.21.1`

---

## 3. Struktur Proyek Aktual

```text
PINJAMv2/
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc
├── API_CONTRACT_PINJAM.md
├── BACKEND_SPEC_PINJAM.md
├── FRONTEND_SPEC_PINJAM.md
├── PRD_PINJAM_FINAL.md
├── PROJECT_CONTEXT.md
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.mts
├── vitest.setup.ts
└── src/
    ├── app/
    │   ├── admin/
    │   │   ├── applications/
    │   │   │   ├── [id]/page.tsx
    │   │   │   └── page.tsx
    │   │   ├── operating-hours/page.tsx
    │   │   ├── projectors/
    │   │   │   ├── [id]/page.tsx
    │   │   │   └── page.tsx
    │   │   ├── staff/page.tsx
    │   │   └── page.tsx
    │   ├── application/status/page.tsx
    │   ├── forbidden/page.tsx
    │   ├── komting/
    │   │   ├── bookings/
    │   │   │   ├── [id]/page.tsx
    │   │   │   ├── new/page.tsx
    │   │   │   └── page.tsx
    │   │   ├── loans/page.tsx
    │   │   ├── page.tsx
    │   │   └── projectors/page.tsx
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   ├── staff/
    │   │   ├── bookings/
    │   │   │   ├── [id]/page.tsx
    │   │   │   └── page.tsx
    │   │   ├── loans/
    │   │   │   ├── [id]/return/page.tsx
    │   │   │   └── page.tsx
    │   │   ├── maintenance/
    │   │   │   ├── [id]/page.tsx
    │   │   │   └── page.tsx
    │   │   ├── page.tsx
    │   │   └── scan/page.tsx
    │   ├── verify-email/page.tsx
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── not-found.tsx
    │   └── page.tsx
    ├── components/
    │   ├── auth/
    │   │   ├── __tests__/role-guard.test.tsx
    │   │   └── role-guard.tsx
    │   ├── feedback/
    │   │   ├── __tests__/feedback-states.test.tsx
    │   │   ├── alert.tsx
    │   │   ├── empty-state.tsx
    │   │   ├── error-state.tsx
    │   │   └── loading-state.tsx
    │   ├── layout/
    │   │   ├── __tests__/admin-shell.test.tsx
    │   │   ├── admin-shell.tsx
    │   │   ├── app-shell.tsx
    │   │   ├── komting-shell.tsx
    │   │   └── staff-shell.tsx
    │   ├── providers/
    │   │   └── app-providers.tsx
    │   ├── qr/
    │   │   └── booking-qr-card.tsx
    │   └── ui/
    │       ├── badge.tsx
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── dialog.tsx
    │       ├── form-field.tsx
    │       ├── icons.tsx
    │       ├── input.tsx
    │       ├── select.tsx
    │       ├── spinner.tsx
    │       └── textarea.tsx
    ├── features/
    │   ├── admin/
    │   │   ├── __tests__/
    │   │   │   ├── admin-applications.test.tsx
    │   │   │   ├── admin-dashboard-view.test.tsx
    │   │   │   ├── admin-operating-hours.test.tsx
    │   │   │   ├── admin-projectors.test.tsx
    │   │   │   └── admin-staff-management.test.tsx
    │   │   ├── admin-application-detail-view.tsx
    │   │   ├── admin-applications-list-view.tsx
    │   │   ├── admin-dashboard-view.tsx
    │   │   ├── admin-operating-hours-view.tsx
    │   │   ├── admin-projector-detail-view.tsx
    │   │   ├── admin-projectors-list-view.tsx
    │   │   └── admin-staff-management-view.tsx
    │   ├── auth/
    │   │   ├── __tests__/login-form.test.tsx
    │   │   ├── login-form.tsx
    │   │   └── verify-email-view.tsx
    │   ├── bookings/
    │   │   ├── __tests__/
    │   │   │   ├── booking-detail-view.test.tsx
    │   │   │   ├── booking-list-view.test.tsx
    │   │   │   └── new-booking-form.test.tsx
    │   │   ├── booking-detail-view.tsx
    │   │   ├── booking-list-view.tsx
    │   │   └── new-booking-form.tsx
    │   ├── komting/
    │   │   ├── __tests__/
    │   │   │   ├── application-status-view.test.tsx
    │   │   │   └── register-application-form.test.tsx
    │   │   ├── application-status-view.tsx
    │   │   ├── komting-dashboard-view.tsx
    │   │   └── register-application-form.tsx
    │   ├── loans/
    │   │   ├── __tests__/komting-loan-history-view.test.tsx
    │   │   └── komting-loan-history-view.tsx
    │   ├── projectors/
    │   │   ├── __tests__/projector-list-view.test.tsx
    │   │   └── projector-list-view.tsx
    │   └── staff/
    │       ├── __tests__/
    │       │   ├── staff-booking-operations.test.tsx
    │       │   ├── staff-dashboard-view.test.tsx
    │       │   ├── staff-maintenance-view.test.tsx
    │       │   ├── staff-qr-scan-view.test.tsx
    │       │   └── staff-return-inspection.test.tsx
    │       ├── pickup-confirmation-panel.tsx
    │       ├── return-inspection-form.tsx
    │       ├── staff-booking-detail-view.tsx
    │       ├── staff-booking-list-view.tsx
    │       ├── staff-dashboard-view.tsx
    │       ├── staff-loan-list-view.tsx
    │       ├── staff-maintenance-detail-view.tsx
    │       ├── staff-maintenance-view.tsx
    │       ├── staff-qr-scan-view.tsx
    │       └── staff-return-inspection-view.tsx
    ├── hooks/
    │   └── use-async-query.ts
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts
    │   │   ├── errors.ts
    │   │   └── types.ts
    │   ├── auth/
    │   │   ├── auth-context.tsx
    │   │   ├── navigation.ts
    │   │   └── provider-adapter.ts
    │   ├── config/
    │   │   └── env.ts
    │   ├── utils/
    │   │   ├── cn.ts
    │   │   ├── date.ts
    │   │   └── idempotency.ts
    │   └── validation/
    │       ├── __tests__/booking.test.ts
    │       ├── admin.ts
    │       ├── application.ts
    │       ├── auth.ts
    │       ├── booking.ts
    │       └── staff.ts
    ├── services/
    │   ├── api/
    │   │   └── api-services.ts
    │   ├── mock/
    │   │   ├── mock-adapter.ts
    │   │   ├── mock-fixtures.ts
    │   │   └── mock-services.ts
    │   ├── contracts.ts
    │   └── index.ts
    └── types/
        └── domain.ts
```

---

## 4. Halaman & Route yang Telah Dibuat

### Fondasi & Auth / Publik (FE-0 & FE-1)
- `/` — Baseline FE-0 dan tautan navigasi cepat.
- `/login` — Form login email & password, validasi, loading/error state aman, redirect per role dari `GET /api/v1/me`.
- `/verify-email` — Status dan pemrosesan token verifikasi email melalui `AuthProviderAdapter`.
- `/register` — Form pengajuan pendaftaran komting (`POST /api/v1/komting/applications` via `FormData` + preview foto lokal).
- `/application/status` — Status pengajuan komting (`GET /api/v1/komting/applications/me`).
- `/forbidden` — Halaman `403` untuk akses role tidak sesuai.

### Halaman KOMTING (FE-1 & FE-2)
- `/komting` — Dashboard komting (`RoleGuard` `KOMTING`, `KomtingShell`, ringkasan kelas/assignment, active booking/loan, tautan ke daftar proyektor & booking baru).
- `/komting/projectors` — Daftar proyektor dengan filter `physical_status`, pengecekan ketersediaan berbasis tanggal (`GET /api/v1/availability`) untuk hari ini/besok, dan tautan pilih unit ke form booking.
- `/komting/bookings/new` (**FE-2**) — Form booking proyektor untuk hari ini atau besok (`Asia/Jakarta`), pemilihan waktu fleksibel per menit, jam operasional dinamis dari backend, pengecekan availability, ringkasan booking, pencegahan double-submit, dan header `Idempotency-Key`.
- `/komting/bookings` (**FE-2**) — Daftar booking komting dengan filter status (`CONFIRMED`, `FULFILLED`, `CANCELLED`, `EXPIRED`), pagination, jendela pickup, serta state loading/empty/error.
- `/komting/bookings/[id]` (**FE-2**) — Detail booking, jendela & batas waktu pickup, komponen `BookingQrCard` yang merender token opaque dari `GET /api/v1/komting/bookings/{id}/qr`, dan dialog konfirmasi pembatalan (`POST /api/v1/komting/bookings/{id}/cancel`) untuk booking `CONFIRMED`.
- `/komting/loans` (**FE-2**) — Riwayat peminjaman komting (`GET /api/v1/komting/loans`) dengan filter status (`ACTIVE`, `RETURNED`), pagination, waktu pickup, waktu kembali aktual, dan kondisi pengembalian.

### Halaman STAFF Operasional (FE-3)
Seluruh halaman di bawah `/staff/*` dilindungi oleh `RoleGuard` dengan `allowedRoles={["STAFF", "ADMIN"]}` dan dibungkus `StaffShell` (tanpa fitur admin/audit-log).
- `/staff` — Dashboard operasional STAFF (`StaffDashboardView`, ringkasan jumlah booking hari ini, pending pickup, active loan, indikator overdue, unit maintenance, daftar antrean pickup, active loan, dan aktivitas terbaru).
- `/staff/bookings` — Daftar booking operasional (`StaffBookingListView`) dengan filter status & tanggal, detail komting/kelas/proyektor, jadwal, jendela pickup, dan kode booking.
- `/staff/bookings/[id]` — Detail booking operasional (`StaffBookingDetailView`) serta panel validasi QR & konfirmasi pickup (`PickupConfirmationPanel`).
- `/staff/scan` — Pemindai & validasi QR (`StaffQrScanView`) menggunakan `BarcodeDetector` kamera opsional dan fallback input manual `qr_payload`, mendukung mode `PICKUP` (konfirmasi eksplisit `ConfirmDialog` + `Idempotency-Key`) maupun `RETURN` (langsung merender `ReturnInspectionForm` dalam state React tanpa menempatkan token QR di URL atau `localStorage`).
- `/staff/loans` — Daftar transaksi peminjaman operasional (`StaffLoanListView`) dengan akses ke halaman inspeksi pengembalian.
- `/staff/loans/[id]/return` — Halaman inspeksi pengembalian (`StaffReturnInspectionView` & `ReturnInspectionForm`) dengan pilihan kondisi `NORMAL`/`DAMAGED`, kelengkapan `COMPLETE`/`INCOMPLETE`, catatan, penerima/pengembali (`returned_by`), serta `evidence_photo` wajib dinamis saat `DAMAGED` atau `INCOMPLETE` (`FormData` + `Idempotency-Key`), tanpa perhitungan denda/sanksi otomatis.
- `/staff/maintenance` — Manajemen maintenance proyektor (`StaffMaintenanceView`): daftar catatan maintenance & daftar unit proyektor (`AVAILABLE`, `BORROWED`, `MAINTENANCE`, `INACTIVE`), aksi menandai unit `AVAILABLE` ke `MAINTENANCE` dengan alasan wajib.
- `/staff/maintenance/[id]` — Detail catatan maintenance (`StaffMaintenanceDetailView`) dan penyelesaian maintenance dengan `resolution_note` serta opsi `set_projector_available`.

### Halaman ADMIN (FE-4.1, FE-4.2, & FE-4.3)
Seluruh halaman di bawah `/admin/*` dilindungi oleh `RoleGuard` dengan `allowedRoles={["ADMIN"]}` dan dibungkus `AdminShell`.
- `/admin` (**FE-4.1**) — Dashboard ADMIN (`AdminDashboardView`): menggabungkan data dari `GET /api/v1/staff/dashboard` dan `GET /api/v1/admin/komting/applications` secara defensif (menampilkan ringkasan booking hari ini, loan aktif, overdue, status unit maintenance, aktivitas operasional terbaru, serta jumlah & daftar pengajuan komting pending; gagal parsial menampilkan `"—"` dan alert error tanpa mengarang angka `0`).
- `/admin/applications` (**FE-4.2**) — Daftar pengajuan komting (`AdminApplicationsListView`) dengan filter status kontrak (`ALL`, `PENDING_VERIFICATION`, `PENDING_REVIEW`, `PENDING_REPLACEMENT_NOTICE`, `PENDING_EMAIL_VERIFICATION`, `APPROVED`, `REJECTED`, `WITHDRAWN`), pagination, indikator pengajuan baru vs pergantian (*replacement*), serta state loading/empty/error.
- `/admin/applications/[id]` (**FE-4.2**) — Detail pengajuan komting (`AdminApplicationDetailView`): informasi pendaftar/kelas/status/catatan, panel khusus Dokumen Identitas (Privat) yang menjelaskan pratinjau foto belum tersedia karena menunggu mekanisme akses privat backend (tanpa URL publik), serta aksi berstatus-ketat untuk **Approve Pengajuan Baru** (`POST .../approve`), **Reject** dengan alasan wajib (`POST .../reject`), dan **Approve Replacement** atomik dengan `Idempotency-Key` (`POST .../approve-replacement`).
- `/admin/projectors` (**FE-4.3**) — Daftar & pembuatan inventaris proyektor (`AdminProjectorsListView`) menggunakan `GET /api/v1/projectors` dan `POST /api/v1/admin/projectors`: pencarian client-side (`asset_code`, `name`, `brand`, `model`), filter `physical_status`, pagination, form tambah unit dengan konfirmasi, pemisahan tegas badge status fisik vs aktif/nonaktif inventaris, serta pencegahan double-submit.
- `/admin/projectors/[id]` (**FE-4.3**) — Detail, edit metadata, & penonaktifan unit (`AdminProjectorDetailView`) menggunakan `GET /api/v1/projectors/{id}`, `PATCH /api/v1/admin/projectors/{id}` (kode aset `disabled` tidak dapat diedit; status fisik tidak diubah lewat form metadata), dan `POST /api/v1/admin/projectors/{id}/deactivate` (dialog konfirmasi dampak, penanganan konflik `PROJECTOR_HAS_ACTIVE_LOAN`, tanpa mengubah status fisik ke `MAINTENANCE`/`AVAILABLE`).
- `/admin/staff` (**FE-4.4**) — Halaman manajemen akun STAFF (`AdminStaffManagementView`, dilindungi `RoleGuard allowedRoles={["ADMIN"]}` + `AdminShell`). Karena `API_CONTRACT_PINJAM.md` (v1.0.0) belum mendefinisikan endpoint daftar, pembuatan manual, pembaruan, maupun aktivasi/penonaktifan akun STAFF, halaman menampilkan pemberitahuan gap kontrak dan batasan keamanan secara jujur (tanpa endpoint fiktif, tanpa mock palsu, tanpa self-registration STAFF).
- `/admin/operating-hours` (**FE-4.5**) — Konfigurasi jam operasional (`AdminOperatingHoursView`) menggunakan `GET /api/v1/operating-hours?date=YYYY-MM-DD` dan `PUT /api/v1/admin/operating-hours/{date}`: menampilkan snapshot aktif `Asia/Jakarta` (`opens_at`, `closes_at`, `early_pickup_allowed_at`, `configured_open_at`), informasi jam buka standar 08:00 / pickup 07:45 / pembukaan lebih awal dengan toleransi 30 menit, form perubahan jam buka/tutup/pembukaan awal & catatan, dialog konfirmasi berisi ringkasan perubahan, pencegahan double-submit, dan penanganan `409 OPERATING_HOURS_CONFLICT` beserta `details`.
- Navigasi ADMIN pada `AdminShell` (`src/components/layout/admin-shell.tsx`) menautkan `/admin`, `/admin/applications`, `/admin/projectors`, `/admin/operating-hours`, `/admin/staff` (badge `Menunggu API`), tautan placeholder berlabel `Segera` untuk modul FE-4 berikutnya (`/admin/komting`, `/admin/audit-logs`, `/admin/corrections`), serta akses langsung ke operasional STAFF (`/staff`).

---

## 5. Fondasi Auth, RoleGuard, & Komponen Baru (FE-1, FE-2, FE-3, & FE-4)

- **Auth & Session (`src/lib/auth/`):** `AuthProviderAdapter`, `AuthProvider`/`useAuth`, `setAccessTokenProvider`, `RoleGuard` (`src/components/auth/role-guard.tsx`), `KomtingShell` (`src/components/layout/komting-shell.tsx` diperbarui dengan menu `Booking Baru`, `Daftar Booking`, `Riwayat Peminjaman`), `StaffShell` (`src/components/layout/staff-shell.tsx` dengan navigasi `/staff`, `/staff/scan`, `/staff/bookings`, `/staff/loans`, `/staff/maintenance`), serta `AdminShell` (`src/components/layout/admin-shell.tsx`).
- **Validasi ADMIN (`src/lib/validation/admin.ts`):** `isReplacementApplication`, `canApproveNewApplication`, `canApproveReplacementApplication`, `canRejectApplication`, `validateRejectApplicationForm`, `validateCreateProjectorForm`, `validateUpdateProjectorForm`, `normalizeApiTime`, dan `validateOperatingHoursForm`.
- **Perbaikan UX Dialog (`src/components/ui/dialog.tsx`):** Menyimpan `onClose` dan `closeDisabled` di ref agar `useEffect` focus dialog hanya berjalan saat `open` berubah (mencegah fokus tercuri saat mengetik alasan pembatalan di `ConfirmDialog`).
- **Utilitas Waktu & Validasi (`src/lib/utils/date.ts`, `src/lib/validation/booking.ts`, `src/lib/validation/staff.ts`):**
  - Helper `getJakartaDateString`, `getJakartaTomorrowDateString`, `getJakartaCurrentTimeString`, `jakartaDateTimeToUtcIso`, dan `formatJakartaTimeOnly`.
  - Validasi booking (`booking.ts`): hanya hari ini atau besok `Asia/Jakarta`, penolakan waktu lampau, pemilihan per menit, estimasi kembali pada hari yang sama setelah waktu mulai, serta batas jam operasional dari backend.
  - Validasi operasional staff (`staff.ts`): `validatePickupForm` (wajib nama perwakilan bila `REPRESENTATIVE`), `isEvidencePhotoRequired` & `validateEvidencePhotoFile` (foto bukti wajib saat `DAMAGED` atau `INCOMPLETE`), `validateReturnInspectionForm`, `validateStartMaintenanceForm`, dan `validateCompleteMaintenanceForm`.
- **Komponen QR & Operasional Staff:**
  - `BookingQrCard` (`src/components/qr/booking-qr-card.tsx`): merender SVG QR dari `qr_payload` opaque backend tanpa menyimpan di `localStorage`, menampilkan `booking_code` sebagai alternatif aksesibel, serta menegaskan QR scan bukan konfirmasi transaksi.
  - `PickupConfirmationPanel` (`src/features/staff/pickup-confirmation-panel.tsx`): menampilkan ringkasan validasi QR tanpa auto-konfirmasi, pemilihan penerima `KOMTING`/`REPRESENTATIVE`, serta dialog konfirmasi eksplisit dengan `Idempotency-Key`.
  - `ReturnInspectionForm` (`src/features/staff/return-inspection-form.tsx`): inspeksi pengembalian via `FormData` + `Idempotency-Key` dengan prasyarat foto bukti dinamis dan penolakan sanksi/denda otomatis.

---

## 6. Endpoint API, Struktur Request/Response, & Mock Service (FE-2 & FE-3)

- **Endpoint API Contract yang Digunakan di FE-2:**
  - `GET /api/v1/operating-hours?date=YYYY-MM-DD` -> `ApiSingleResponse<OperatingHoursSnapshot>` (`opens_at`, `closes_at`, `early_pickup_allowed_at`).
  - `GET /api/v1/availability?projector_id=...&date=YYYY-MM-DD` -> `ApiSingleResponse<AvailabilityResult>` (`is_bookable`, `physical_status`, `operating_hours`, `message`).
  - `POST /api/v1/bookings` (Header `Idempotency-Key`) -> Request `{ projector_id, booking_date, start_time, estimated_return_at }`, Response `201` `ApiSingleResponse<Booking>`.
  - `GET /api/v1/komting/bookings?status=...&page=1&page_size=10` -> `ApiListResponse<Booking>`.
  - `GET /api/v1/komting/bookings/{booking_id}` -> `ApiSingleResponse<Booking>`.
  - `GET /api/v1/komting/bookings/{booking_id}/qr` -> `ApiSingleResponse<{ qr_payload, expires_at }>`.
  - `POST /api/v1/komting/bookings/{booking_id}/cancel` -> Request `{ reason }`, Response `ApiSingleResponse<Booking>`.
  - `GET /api/v1/komting/loans?status=...&page=1&page_size=10` -> `ApiListResponse<Loan>`.
- **Endpoint API Contract yang Digunakan di FE-3:**
  - `GET /api/v1/staff/dashboard` -> `ApiSingleResponse<StaffDashboardSummary>` (seluruh field opsional; UI merender `"—"` atau empty state bila field belum disediakan backend).
  - `GET /api/v1/staff/bookings` & `GET /api/v1/staff/bookings/{booking_id}` -> Daftar & detail booking operasional (`Booking`), dipadukan lookup proyektor melalui `GET /api/v1/projectors` / `GET /api/v1/projectors/{projector_id}` dengan fallback `komting_id`/`projector_id`.
  - `POST /api/v1/staff/qr/validate` -> Validasi token QR opaque (`QrValidationResponse` sesuai §9.2 tanpa `loan_id`); untuk `RETURN`, loan `ACTIVE` dicari melalui `GET /api/v1/staff/loans?status=ACTIVE` berdasarkan `booking_id`.
  - `POST /api/v1/staff/bookings/{booking_id}/pickup` (Header `Idempotency-Key`) -> Konfirmasi penyerahan (`KOMTING` / `REPRESENTATIVE` + nama perwakilan).
  - `GET /api/v1/staff/loans` & `GET /api/v1/staff/loans/{loan_id}` -> Daftar & detail peminjaman operasional (`Loan`), dipadukan lookup proyektor melalui `GET /api/v1/projectors` / `GET /api/v1/projectors/{projector_id}` dengan fallback ID.
  - `POST /api/v1/staff/loans/{loan_id}/return` (`FormData` + Header `Idempotency-Key`) -> Konfirmasi pengembalian & inspeksi kondisi/kelengkapan + `evidence_photo`.
  - `GET /api/v1/staff/maintenance` -> Daftar catatan maintenance (termasuk pencarian berpaginasi pada `StaffMaintenanceDetailView`).
  - `POST /api/v1/staff/projectors/{projector_id}/maintenance` -> Menandai unit `AVAILABLE` menjadi `MAINTENANCE`.
  - `POST /api/v1/staff/maintenance/{maintenance_id}/complete` -> Menyelesaikan maintenance dengan `resolution_note` dan `set_projector_available`.
- **Mock Service FE-2 & FE-3 (`src/services/mock/mock-fixtures.ts` & `src/services/mock/mock-services.ts`):**
  - Simulasi `checkAvailability`, `getOperatingHours`, `createBooking`, `MOCK_SIMULATION_BOOKINGS`, `MOCK_SIMULATION_LOANS`, `getBookingQr`, dan `cancelKomtingBooking` untuk FE-2 (model `Booking` & `Loan` mengikuti kontrak §4.4 & §4.5 secara ketat).
  - Simulasi FE-3 dengan store stateful in-memory (`mockProjectorsStore`, `mockBookingsStore`, `mockLoansStore`, `mockMaintenanceStore`, `mockQrTokenStore`, `mockStaffIdempotencyStore`), guard `requireStaffOrAdminMock()`, `MOCK_SIMULATION_MAINTENANCE`, dan `MOCK_SIMULATION_QR_TOKENS` (`sim_qr_pickup_ready_01`, `sim_qr_return_active_01`), serta implementasi `listStaffBookings`, `getStaffBooking`, `listStaffLoans`, `getStaffLoan`, `confirmReturn`, `validateQr`, `confirmPickup`, `listMaintenance`, `createMaintenance`, `completeMaintenance`, dan `getStaffDashboard`.
- **Status Integrasi Backend:** Backend masih paralel; frontend siap beralih ke HTTP client nyata di `src/services/api/api-services.ts` begitu endpoint backend dan auth provider siap.

---

## 7. Hasil Pengujian Terakhir (FE-4.5)

Seluruh pemeriksaan dijalankan setelah implementasi FE-4.5 dan lulus (exit code `0`):
- **`npm test` (`vitest run`):** **22 file test, 77 test lulus**:
  - 3 test baru pada `src/features/admin/__tests__/admin-operating-hours.test.tsx` (tampilan snapshot `Asia/Jakarta` + retry saat error, validasi jam buka/tutup/early-open, ringkasan konfirmasi + `PUT` payload `HH:mm:ss` + konflik `409 OPERATING_HOURS_CONFLICT` + double-submit guard) serta tambahan 1 test di `src/components/auth/__tests__/role-guard.test.tsx` (blokir `STAFF` & `KOMTING` dan izinkan `ADMIN` pada `/admin/operating-hours`; total 10 tests di file tersebut).
  - Seluruh test FE-1 s.d. FE-4.4 sebelumnya tetap lulus tanpa regresi.
- **`npm run typecheck` (`tsc --noEmit`):** Lulus tanpa error.
- **`npm run lint` (`eslint .`):** Lulus tanpa error.
- **Prettier check khusus file FE-4.5 & `PROJECT_CONTEXT.md`:** Lulus (`All matched files use Prettier code style!`).
- **`npm run build` (`next build`):** Lulus — menghasilkan 23 static pages dan 6 dynamic routes (termasuk `/admin/operating-hours`).

---

## 8. Open Decisions & Kendala Integrasi

1. **Detail `admin_early_open_at` & `409 OPERATING_HOURS_CONFLICT` (§12.2, §23 #5):** Kontrak belum menstandardisasi aturan perhitungan otomatis `early_pickup_allowed_at` pada server untuk nilai `admin_early_open_at` sembarang maupun struktur JSON baku array konflik booking pada `error.details` (UI menampilkan array `details` bila tersedia).
2. **Endpoint manajemen akun STAFF belum tersedia di `API_CONTRACT_PINJAM.md` (`/admin/staff`):** Kontrak (v1.0.0) mengakui hak ADMIN mengelola akun STAFF (§3.2, §3.4), tetapi belum mendefinisikan endpoint, payload, filter/pagination, field yang diizinkan diedit, maupun error code untuk daftar, pembuatan manual, pembaruan, atau penonaktifan akun STAFF. Fitur CRUD akun STAFF belum dapat diimplementasikan tanpa melanggar batasan kontrak; `/admin/staff` menampilkan status gap ini secara eksplisit.
2. **Mekanisme akses foto identitas privat (`/admin/applications/[id]`):** `API_CONTRACT_PINJAM.md` §6.3 & §17 belum mendefinisikan endpoint atau field URL bertanda tangan (*signed URL*) untuk foto identitas pendaftar. UI menampilkan informasi aman bahwa pratinjau dokumen menunggu mekanisme akses privat backend (tanpa URL publik atau fiktif).
3. **Informasi komting aktif sebelumnya pada response detail replacement:** Kontrak §6.3–6.4 belum menetapkan field objek komting lama dalam `KomtingApplication`; UI membedakan alur replacement menggunakan `application_type` / `status` dan menampilkan data calon pengganti yang tersedia di kontrak.
4. **Endpoint khusus dashboard ADMIN & daftar assignment komting belum ada di `API_CONTRACT_PINJAM.md`:** `/admin` saat ini mengombinasikan `GET /api/v1/staff/dashboard` dan `GET /api/v1/admin/komting/applications`; halaman `/admin/komting` dan `/admin/corrections` masih menunggu kejelasan kontrak.
5. **Endpoint detail maintenance (`GET /api/v1/staff/maintenance/{maintenance_id}`):** Belum terdefinisi di `API_CONTRACT_PINJAM.md` §11. `StaffMaintenanceDetailView` melakukan pencarian berpaginasi via `GET /api/v1/staff/maintenance` dengan state loading, error, dan not-found; jika catatan berada melampaui batas halaman pencarian (`10` halaman × `20` item), diperlukan endpoint detail khusus di backend.
6. **Validasi QR dengan `booking_code`:** `POST /api/v1/staff/qr/validate` menerima token `qr_payload` opaque, bukan `booking_code`. Pada `/staff/bookings/[id]`, staf memvalidasi menggunakan token QR atau melalui `/staff/scan`.
7. **Relasi `loan_id` pada respons `RETURN` QR:** `API_CONTRACT_PINJAM.md` §9.2 belum menyertakan `loan_id` pada `QrValidationResponse.transaction`. Frontend tidak mengasumsikan `loan_id` dan mencari transaksi aktif via `GET /api/v1/staff/loans?status=ACTIVE` berdasarkan `booking_id`.
8. **Identitas komting, kelas, & kode booking pada model `Booking`/`Loan`:** Kontrak (§4.4, §4.5) hanya menyediakan `komting_id`, `projector_id`, dan `booking_id` (tanpa `komting_name`, `class_name`, `projector_name`, maupun `booking_code` pada `Loan`) serta belum menyediakan endpoint lookup komting untuk role `STAFF`. Frontend melakukan lookup proyektor via `/api/v1/projectors` / `/api/v1/projectors/{projector_id}` dan menampilkan fallback ID (`komting_id`, `booking_id`, `projector_id`) bila nama belum tersedia.
9. **Skema respons `GET /api/v1/staff/dashboard`:** Kontrak (§7.4) belum menetapkan struktur JSON baku untuk ringkasan dashboard; `StaffDashboardSummary` memperlakukan seluruh ringkasan dan daftar secara opsional dengan fallback aman `"—"` serta empty/error retry state.
10. **Open Decisions FE-1 & FE-2 yang masih terbuka:** Provider autentikasi final, detail field/retensi upload foto, tenggat respons replacement komting, batas waktu self-cancel komting, serta detail slot jadwal pada `GET /api/v1/availability`.

---

## 9. Backlog Sprint Berikutnya (FE-4.6+ — Modul ADMIN Lanjutan)

- Implementasi modul ADMIN lanjutan sesuai kesiapan kontrak: audit log (`/admin/audit-logs`), serta modul yang masih menunggu finalisasi kontrak (`/admin/komting`, `/admin/staff` penuh setelah endpoint tersedia, `/admin/corrections`).
