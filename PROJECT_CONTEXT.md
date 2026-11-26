# PROJECT CONTEXT — PINJAM

- **Terakhir Diperbarui:** 26 November 2026
- **Sprint Terakhir:** Sprint FE-4.1 — ADMIN Shell & Dashboard
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
    │   │   ├── __tests__/admin-dashboard-view.test.tsx
    │   │   └── admin-dashboard-view.tsx
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

### Halaman ADMIN (FE-4.1)
Seluruh halaman di bawah `/admin/*` dilindungi oleh `RoleGuard` dengan `allowedRoles={["ADMIN"]}` dan dibungkus `AdminShell`.
- `/admin` — Dashboard ADMIN (`AdminDashboardView`): menggabungkan data dari `GET /api/v1/staff/dashboard` dan `GET /api/v1/admin/komting/applications` secara defensif (menampilkan ringkasan booking hari ini, loan aktif, overdue, status unit maintenance, aktivitas operasional terbaru, serta jumlah & daftar pengajuan komting pending; gagal parsial menampilkan `"—"` dan alert error tanpa mengarang angka `0`).
- Navigasi ADMIN pada `AdminShell` (`src/components/layout/admin-shell.tsx`) menyediakan akses ke `/admin`, tautan placeholder berlabel `Segera` untuk modul FE-4 berikutnya (`/admin/applications`, `/admin/komting`, `/admin/staff`, `/admin/projectors`, `/admin/operating-hours`, `/admin/audit-logs`, `/admin/corrections`), serta akses langsung ke operasional STAFF (`/staff`).

---

## 5. Fondasi Auth, RoleGuard, & Komponen Baru (FE-1, FE-2, FE-3, & FE-4.1)

- **Auth & Session (`src/lib/auth/`):** `AuthProviderAdapter`, `AuthProvider`/`useAuth`, `setAccessTokenProvider`, `RoleGuard` (`src/components/auth/role-guard.tsx`), `KomtingShell` (`src/components/layout/komting-shell.tsx` diperbarui dengan menu `Booking Baru`, `Daftar Booking`, `Riwayat Peminjaman`), `StaffShell` (`src/components/layout/staff-shell.tsx` dengan navigasi `/staff`, `/staff/scan`, `/staff/bookings`, `/staff/loans`, `/staff/maintenance`), serta `AdminShell` (`src/components/layout/admin-shell.tsx`).
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

## 7. Hasil Pengujian Terakhir (FE-4.1)

Seluruh pemeriksaan dijalankan setelah implementasi FE-4.1 dan lulus (exit code `0`):
- **`npm test` (`vitest run`):** **18 file test, 59 test lulus**:
  - 9 test baru FE-4.1:
    - `src/features/admin/__tests__/admin-dashboard-view.test.tsx` (6 tests: loading, data lengkap + hitung pengajuan pending + link STAFF, empty state, partial missing fields tanpa `0`, error total + retry, error parsial pengajuan tanpa `0`)
    - `src/components/layout/__tests__/admin-shell.test.tsx` (2 tests: navigasi ADMIN termasuk `/staff` & `Segera`, serta isolasi `StaffShell`)
    - Tambahan 1 test di `src/components/auth/__tests__/role-guard.test.tsx` (ADMIN dapat mengakses `/admin`; total 6 tests)
  - Seluruh 50 test FE-1, FE-2, & FE-3 sebelumnya tetap lulus tanpa regresi.
- **`npm run typecheck` (`tsc --noEmit`):** Lulus tanpa error.
- **`npm run lint` (`eslint .`):** Lulus tanpa error.
- **Prettier check khusus file FE-4.1 & `PROJECT_CONTEXT.md`:** Lulus (`All matched files use Prettier code style!`).
- **`npm run build` (`next build`):** Lulus — menghasilkan total 19 route (menambahkan `/admin` pada baseline 18 route FE-3).

---

## 8. Open Decisions & Kendala Integrasi

1. **Endpoint khusus dashboard ADMIN & manajemen STAFF belum ada di `API_CONTRACT_PINJAM.md`:** `/admin` saat ini mengombinasikan `GET /api/v1/staff/dashboard` dan `GET /api/v1/admin/komting/applications`; halaman `/admin/staff`, `/admin/komting`, `/admin/corrections` masih menunggu kejelasan kontrak.
2. **Endpoint detail maintenance (`GET /api/v1/staff/maintenance/{maintenance_id}`):** Belum terdefinisi di `API_CONTRACT_PINJAM.md` §11. `StaffMaintenanceDetailView` melakukan pencarian berpaginasi via `GET /api/v1/staff/maintenance` dengan state loading, error, dan not-found; jika catatan berada melampaui batas halaman pencarian (`10` halaman × `20` item), diperlukan endpoint detail khusus di backend.
3. **Validasi QR dengan `booking_code`:** `POST /api/v1/staff/qr/validate` menerima token `qr_payload` opaque, bukan `booking_code`. Pada `/staff/bookings/[id]`, staf memvalidasi menggunakan token QR atau melalui `/staff/scan`.
4. **Relasi `loan_id` pada respons `RETURN` QR:** `API_CONTRACT_PINJAM.md` §9.2 belum menyertakan `loan_id` pada `QrValidationResponse.transaction`. Frontend tidak mengasumsikan `loan_id` dan mencari transaksi aktif via `GET /api/v1/staff/loans?status=ACTIVE` berdasarkan `booking_id`.
5. **Identitas komting, kelas, & kode booking pada model `Booking`/`Loan`:** Kontrak (§4.4, §4.5) hanya menyediakan `komting_id`, `projector_id`, dan `booking_id` (tanpa `komting_name`, `class_name`, `projector_name`, maupun `booking_code` pada `Loan`) serta belum menyediakan endpoint lookup komting untuk role `STAFF`. Frontend melakukan lookup proyektor via `/api/v1/projectors` / `/api/v1/projectors/{projector_id}` dan menampilkan fallback ID (`komting_id`, `booking_id`, `projector_id`) bila nama belum tersedia.
6. **Skema respons `GET /api/v1/staff/dashboard`:** Kontrak (§7.4) belum menetapkan struktur JSON baku untuk ringkasan dashboard; `StaffDashboardSummary` memperlakukan seluruh ringkasan dan daftar secara opsional dengan fallback aman `"—"` serta empty/error retry state.
7. **Open Decisions FE-1 & FE-2 yang masih terbuka:** Provider autentikasi final, detail field/retensi upload foto, tenggat respons replacement komting, batas waktu self-cancel komting, serta detail slot jadwal pada `GET /api/v1/availability`.

---

## 9. Backlog Sprint Berikutnya (FE-4.2+ — Modul ADMIN Lanjutan)

- Implementasi modul ADMIN lanjutan sesuai kesiapan kontrak: verifikasi pengajuan komting (`/admin/applications`, `/admin/applications/[id]`), inventaris proyektor (`/admin/projectors`), jam operasional (`/admin/operating-hours`), audit log (`/admin/audit-logs`), serta modul yang masih menunggu finalisasi kontrak (`/admin/komting`, `/admin/staff`, `/admin/corrections`).
