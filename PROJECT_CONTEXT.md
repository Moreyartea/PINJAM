# PROJECT CONTEXT — PINJAM

**Terakhir Diperbarui:** 26 November 2026  
**Sprint Terakhir:** Sprint FE-2 — Booking dan Peminjaman KOMTING  
**Branch Frontend Aktif:** `feat/frontend-fe2-booking` (dibuat dari `staging` pasca merge FE-1 `#1`)  
**Acuan Utama:**
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
    │   │   ├── app-shell.tsx
    │   │   └── komting-shell.tsx
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
    │   └── projectors/
    │       ├── __tests__/projector-list-view.test.tsx
    │       └── projector-list-view.tsx
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
    │       └── booking.ts
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

---

## 5. Fondasi Auth, RoleGuard, & Komponen Baru (FE-1 & FE-2)

- **Auth & Session (`src/lib/auth/`):** `AuthProviderAdapter`, `AuthProvider`/`useAuth`, `setAccessTokenProvider`, `RoleGuard` (`src/components/auth/role-guard.tsx`), `KomtingShell` (`src/components/layout/komting-shell.tsx` diperbarui dengan menu `Booking Baru`, `Daftar Booking`, `Riwayat Peminjaman`).
- **Perbaikan UX Dialog (`src/components/ui/dialog.tsx`):** Menyimpan `onClose` dan `closeDisabled` di ref agar `useEffect` focus dialog hanya berjalan saat `open` berubah (mencegah fokus tercuri saat mengetik alasan pembatalan di `ConfirmDialog`).
- **Utilitas Waktu & Validasi Booking (`src/lib/utils/date.ts`, `src/lib/validation/booking.ts`):**
  - Helper `getJakartaDateString`, `getJakartaTomorrowDateString`, `getJakartaCurrentTimeString`, `jakartaDateTimeToUtcIso`, dan `formatJakartaTimeOnly`.
  - Validasi tanggal (hanya hari ini atau besok `Asia/Jakarta`), penolakan waktu lampau, pemilihan per menit, estimasi kembali pada hari yang sama setelah waktu mulai, serta batas jam operasional dari backend (bukan hardcode).
- **Komponen QR (`src/components/qr/booking-qr-card.tsx`):** Merender SVG QR dari `qr_payload` opaque backend tanpa menyimpan di `localStorage`, menampilkan `booking_code` sebagai alternatif aksesibel, serta menegaskan QR scan bukan konfirmasi transaksi.

---

## 6. Endpoint API, Struktur Request/Response, & Mock Service (FE-2)

- **Endpoint API Contract yang Digunakan di FE-2:**
  - `GET /api/v1/operating-hours?date=YYYY-MM-DD` -> `ApiSingleResponse<OperatingHoursSnapshot>` (`opens_at`, `closes_at`, `early_pickup_allowed_at`).
  - `GET /api/v1/availability?projector_id=...&date=YYYY-MM-DD` -> `ApiSingleResponse<AvailabilityResult>` (`is_bookable`, `physical_status`, `operating_hours`, `message`).
  - `POST /api/v1/bookings` (Header `Idempotency-Key`) -> Request `{ projector_id, booking_date, start_time, estimated_return_at }`, Response `201` `ApiSingleResponse<Booking>`.
  - `GET /api/v1/komting/bookings?status=...&page=1&page_size=10` -> `ApiListResponse<Booking>`.
  - `GET /api/v1/komting/bookings/{booking_id}` -> `ApiSingleResponse<Booking>`.
  - `GET /api/v1/komting/bookings/{booking_id}/qr` -> `ApiSingleResponse<{ qr_payload, expires_at }>`.
  - `POST /api/v1/komting/bookings/{booking_id}/cancel` -> Request `{ reason }`, Response `ApiSingleResponse<Booking>`.
  - `GET /api/v1/komting/loans?status=...&page=1&page_size=10` -> `ApiListResponse<Loan>`.
- **Mock Service FE-2 (`src/services/mock/mock-fixtures.ts` & `src/services/mock/mock-services.ts`):**
  - Simulasi `checkAvailability` membedakan status fisik `BORROWED` hari ini (tidak bookable hari ini, namun tentatif bookable besok dengan pesan bersyarat pukul 00:00 WIB) dan `MAINTENANCE`/`INACTIVE` (tidak bookable).
  - Simulasi `getOperatingHours` mengembalikan jam tutup bervariasi per tanggal (`17:00:00` hari ini, `16:30:00` besok) untuk memastikan UI tidak meng-hardcode jam tutup.
  - Simulasi `createBooking` memvalidasi status akun/assignment aktif, batas 1 booking aktif, dan `Idempotency-Key` (retry payload sama mengembalikan hasil sama; payload berbeda melempar `409 IDEMPOTENCY_KEY_REUSED`).
  - Simulasi `MOCK_SIMULATION_BOOKINGS`, `MOCK_SIMULATION_LOANS`, `getBookingQr`, dan `cancelKomtingBooking`.
- **Status Integrasi Backend:** Backend masih paralel; frontend siap beralih ke HTTP client nyata di `src/services/api/api-services.ts` begitu endpoint backend dan auth provider siap.

---

## 7. Hasil Pengujian Terakhir (FE-2)

Seluruh pemeriksaan dijalankan setelah perubahan kode terakhir dan lulus (exit code `0`):
- **`npm test` (`vitest run`):** **11 file test, 36 test lulus**:
  - `src/lib/validation/__tests__/booking.test.ts` (5 tests: validasi hari ini/besok & menit fleksibel, penolakan tanggal luar rentang, penolakan waktu lampau, validasi estimasi kembali, jam operasional dinamis & guard jam belum tersedia)
  - `src/features/bookings/__tests__/new-booking-form.test.tsx` (2 tests: cek availability saat ubah proyektor/tanggal & jam operasional backend, pencegahan double-submit + reuse `Idempotency-Key` saat retry identik + rotasi key saat edit)
  - `src/features/bookings/__tests__/booking-list-view.test.tsx` (3 tests: loading/cards/jendela pickup, empty + filter status, error + retry)
  - `src/features/bookings/__tests__/booking-detail-view.test.tsx` (2 tests: detail booking + QR opaque SVG, dialog pembatalan + validasi alasan + penolakan backend + refresh status)
  - `src/features/loans/__tests__/komting-loan-history-view.test.tsx` (3 tests: render loan `ACTIVE`/`RETURNED` & kondisi kembali, empty + filter, error)
  - `src/features/projectors/__tests__/projector-list-view.test.tsx` (3 tests: status fisik terpisah + cek ketersediaan tanggal, filter status, error)
  - Serta seluruh 18 test FE-1 (`login-form`, `register-application-form`, `role-guard`, `application-status-view`, `feedback-states`) tetap lulus.
- **`npm run typecheck` (`tsc --noEmit`):** Lulus tanpa error.
- **`npm run lint` (`eslint .`):** Lulus tanpa error maupun warning.
- **`npm run format:check` (`prettier --check .`):** Lulus.
- **`npm run build` (`next build`):** Lulus (13 static routes + 1 dynamic route `/komting/bookings/[id]` ter-build).

---

## 8. Open Decisions & Kendala Integrasi

1. **Detail slot jadwal pada `GET /api/v1/availability`:** Kontrak saat ini mengembalikan `is_bookable`, `physical_status`, `operating_hours`, dan `message` (tanpa daftar slot jam terpakai pada tanggal tersebut). UI menampilkan informasi kontrak tersebut secara jujur; jika diperlukan tampilan daftar slot waktu yang sudah terbooking, perlu penambahan field pada `API_CONTRACT_PINJAM.md`.
2. **Batas waktu pembatalan mandiri oleh Komting (Open Decision #4):** Kontrak tidak menetapkan batas menit sebelum pickup untuk self-cancel; frontend mengizinkan aksi pembatalan pada status `CONFIRMED` dan mengandalkan penolakan backend apabila melewati kebijakan.
3. **Nama proyektor pada daftar booking & loan:** Model `Booking` dan `Loan` di `API_CONTRACT_PINJAM.md` hanya menyertakan `projector_id`. Frontend melakukan lookup ke `GET /api/v1/projectors` untuk menampilkan nama & kode aset bila tersedia, dengan fallback aman ke `projector_id`.
4. **Open Decisions FE-1 yang masih terbuka:** Provider autentikasi final, detail field/retensi upload foto, tenggat respons replacement komting, dan endpoint manajemen STAFF.

---

## 9. Backlog Sprint Berikutnya (FE-3 — STAFF Operasional)

Berdasarkan `FRONTEND_SPEC_PINJAM.md` §18:
- Dashboard operasional STAFF (`/staff` via `GET /api/v1/staff/dashboard`).
- Daftar & detail booking operasional (`/staff/bookings`, `/staff/bookings/[id]`).
- Pemindaian QR & validasi token (`/staff/scan` via `POST /api/v1/staff/qr/validate` dengan fallback token manual).
- Konfirmasi pickup (`/staff/bookings/[id]` -> `POST /api/v1/staff/bookings/{id}/pickup` dengan `Idempotency-Key` dan catatan penerima Komting/Perwakilan).
- Daftar loan (`/staff/loans`) & form pemeriksaan return + upload foto bukti wajib bila `DAMAGED`/`INCOMPLETE` (`/staff/loans/[id]/return`).
- Manajemen maintenance unit (`/staff/maintenance`).
