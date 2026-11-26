# PROJECT CONTEXT — PINJAM

**Terakhir Diperbarui:** 26 November 2026  
**Sprint Terakhir:** Sprint FE-1 — Autentikasi dan Halaman Awal KOMTING  
**Branch Frontend Aktif:** `feat/frontend-fe1-auth-komting` (dibuat dari `staging`)  
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
    │   ├── komting/
    │   │   ├── __tests__/
    │   │   │   ├── application-status-view.test.tsx
    │   │   │   └── register-application-form.test.tsx
    │   │   ├── application-status-view.tsx
    │   │   ├── komting-dashboard-view.tsx
    │   │   └── register-application-form.tsx
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
    │       ├── application.ts
    │       └── auth.ts
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

| Route | Halaman | Akses & Perilaku |
|---|---|---|
| `/` | Baseline FE-0 & Navigasi Awal | Menampilkan ringkasan design system, status adapter, dan tautan navigasi FE-1 |
| `/login` | Login | Form email & password, validasi input, loading/error state aman, redirect sesuai role dari `/api/v1/me`, panel simulasi akun khusus `DEV MOCK` |
| `/verify-email` | Verifikasi Email | Menangani status instruksi maupun verifikasi token melalui adapter auth (tanpa mengarang endpoint) |
| `/register` | Pendaftaran Komting | Form identitas mahasiswa (`full_name`, `student_id`, `class_name`, `email`), upload foto identitas via `FormData` + preview lokal (`URL.createObjectURL`), persetujuan privasi, deteksi hasil `PENDING_REPLACEMENT_NOTICE` |
| `/application/status` | Status Pengajuan Komting | Menampilkan status dari `/api/v1/komting/applications/me` (`PENDING_*`, `PENDING_REPLACEMENT_NOTICE`, `APPROVED`, `REJECTED` + alasan, `WITHDRAWN`), state login/empty/error |
| `/komting` | Dashboard Awal Komting | Dilindungi `RoleGuard` (`KOMTING`) + `KomtingShell`; sapaan, identitas/kelas, status akun & assignment, ringkasan loan aktif, booking aktif, proyektor relevan, empty state |
| `/komting/projectors` | Daftar Proyektor Komting | Dilindungi `RoleGuard` (`KOMTING`); daftar unit, filter `physical_status`, pagination, penjelasan pemisahan status fisik vs booking (belum ada aksi booking) |
| `/forbidden` | 403 Akses Ditolak | Halaman fallback untuk role yang tidak diizinkan oleh `RoleGuard` |

---

## 5. Auth Adapter, Session Management, & RoleGuard

- **Provider-Agnostic Adapter (`src/lib/auth/provider-adapter.ts`):**
  - Mendefinisikan interface `AuthProviderAdapter` (`getSession`, `signInWithPassword`, `verifyEmail`, `signOut`) dan `registerAuthProviderAdapter`.
  - Menyimpan access token di memori (`setActiveAccessToken`) dan menghubungkan `setAccessTokenProvider` pada API client.
  - Tidak menyimpan password dan tidak menyimpan role otoritatif di `localStorage`.
- **Session Context (`src/lib/auth/auth-context.tsx`):**
  - Mengelola state `loading`, `authenticated`, `unauthenticated`, dan `expired`.
  - Selalu mengambil profil & role otoritatif melalui `GET /api/v1/me` (`services.me.getMe()`).
  - Menangani `401 AUTH_REQUIRED` sebagai `expired` dan membersihkan token.
- **RoleGuard (`src/components/auth/role-guard.tsx`) & Navigasi (`src/lib/auth/navigation.ts`):**
  - Menahan redirect saat `status === "loading"` agar tidak terjadi redirect prematur.
  - Mengarahkan pengguna yang belum login/expired ke `/login?next=<path>`.
  - Memeriksa `allowedRoles` terhadap `user.role`; role tidak sesuai diarahkan ke `/forbidden` (KOMTING tidak dapat membuka rute STAFF/ADMIN, STAFF tidak dapat membuka rute ADMIN).
  - Didokumentasikan secara eksplisit bahwa `RoleGuard` hanya proteksi UX frontend dan bukan pengganti otorisasi backend.

---

## 6. Komponen, Hooks, & Validasi Baru (FE-1)

- `src/components/providers/app-providers.tsx` — Pembungkus client provider (`AuthProvider`) di `RootLayout`.
- `src/components/layout/komting-shell.tsx` — Shell navigasi khusus Komting (`Dashboard`, `Daftar Proyektor`, `Status Pengajuan`, aksi `Keluar`).
- `src/hooks/use-async-query.ts` — Hook async data fetching terpusat dengan state `data`, `loading`, `error`, dan `reload`.
- `src/lib/validation/auth.ts` & `src/lib/validation/application.ts` — Validasi input form login dan pendaftaran komting (termasuk validasi tipe MIME `image/jpeg`, `image/png`, `image/webp` dan batas awal 5 MB).
- Feature components di `src/features/auth/`, `src/features/komting/`, `src/features/projectors/`.

---

## 7. Endpoint API, Service, & Mock Integration

- **Endpoint API Contract yang Digunakan di FE-1:**
  - `GET /api/v1/me` — Profil pengguna, role, status akun, dan `komting_assignment`.
  - `POST /api/v1/komting/applications` (`multipart/form-data`) — Pengajuan pendaftaran/pergantian komting.
  - `GET /api/v1/komting/applications/me` — Status pengajuan milik pengguna saat ini.
  - `GET /api/v1/komting/dashboard` — Ringkasan dashboard komting (`KomtingDashboardSummary`).
  - `GET /api/v1/projectors` — Daftar proyektor dengan filter `physical_status` dan pagination.
- **Status Integrasi Backend:**
  - Backend masih dikembangkan terpisah pada kolaborasi paralel; frontend berjalan menggunakan `mockServices` saat `NEXT_PUBLIC_USE_MOCK_API=true` di development (`src/services/mock/mock-fixtures.ts` & `src/services/mock/mock-services.ts`).
  - Real HTTP client (`src/services/api/api-services.ts`) sudah terpasang untuk seluruh endpoint di atas, sedangkan `auth` menunggu registrasi provider final melalui `registerAuthProviderAdapter`.
  - Data simulasi pada `mock-fixtures.ts` menggunakan domain `@simulasi.local` dan kode `SIM-*` serta diberi badge `SIMULASI DEV` di UI agar tidak tertukar dengan data produksi.

---

## 8. Hasil Pengujian Terakhir (FE-1)

Seluruh perintah verifikasi dijalankan setelah edit kode terakhir dan lulus (exit code `0`):
- **`npm test` (`vitest run`):** 6 file test, **21 test lulus**:
  - `src/features/auth/__tests__/login-form.test.tsx` (5 tests)
  - `src/features/komting/__tests__/register-application-form.test.tsx` (3 tests)
  - `src/components/auth/__tests__/role-guard.test.tsx` (4 tests)
  - `src/features/komting/__tests__/application-status-view.test.tsx` (3 tests)
  - `src/features/projectors/__tests__/projector-list-view.test.tsx` (3 tests)
  - `src/components/feedback/__tests__/feedback-states.test.tsx` (3 tests)
- **`npm run typecheck` (`tsc --noEmit`):** Lulus tanpa error.
- **`npm run lint` (`eslint .`):** Lulus tanpa error maupun warning.
- **`npm run format:check` (`prettier --check .`):** Lulus (`All matched files use Prettier code style!`).
- **`npm run build` (`next build`):** Lulus, 10/10 static pages ter-build (`/`, `/_not-found`, `/application/status`, `/forbidden`, `/komting`, `/komting/projectors`, `/login`, `/register`, `/verify-email`).

---

## 9. Open Decisions & Catatan Ketidaksesuaian Kontrak

1. **Provider Autentikasi Final (Open Decision #1):** Supabase Auth atau provider lain belum ditetapkan, sehingga `apiServices.auth` memakai adapter interface (`registerAuthProviderAdapter`) dan belum mengikat ke SDK tertentu.
2. **Field Password pada Form Pendaftaran Komting (Ketidaksesuaian yang Ditemukan):** Prompt FE-1 menyebut password pada pendaftaran, namun `API_CONTRACT_PINJAM.md` §6.1 (`POST /api/v1/komting/applications`) hanya mendefinisikan field `full_name`, `email`, `student_id`, `class_name`, dan `identity_photo` tanpa `password`. Mengikuti aturan tidak mengarang kontrak, form `/register` mengirim hanya 5 field kontrak dan mencatat pembuatan kredensial/password sebagai bagian dari Open Decision #1 & #2 (alur signup provider auth vs pengajuan komting).
3. **Verifikasi Email (`/verify-email`):** `API_CONTRACT_PINJAM.md` belum mendefinisikan endpoint `/api/v1/auth/verify-email` karena bergantung pada mekanisme provider autentikasi. Halaman `/verify-email` didelegasikan ke `services.auth.verifyEmail` (adapter) dan belum memanggil endpoint HTTP kustom.
4. **Open Decisions Lainnya:** Batas ukuran/MIME/retensi foto identitas di server, mekanisme respons & tenggat komting lama saat replacement, batas waktu pembatalan booking oleh komting, endpoint manajemen akun STAFF oleh ADMIN, serta allowlist field koreksi transaksi ADMIN.

---

## 10. Backlog Sprint Berikutnya (FE-2 — Booking)

Berdasarkan `FRONTEND_SPEC_PINJAM.md` §18:
- Pengecekan ketersediaan unit berdasarkan tanggal melalui `GET /api/v1/availability`.
- Form booking baru (`/komting/bookings/new`) dengan pemilihan tanggal hari ini/besok (`Asia/Jakarta`), pemilihan waktu per menit, validasi jam operasional dari backend, pencegahan double-submit, dan header `Idempotency-Key`.
- Daftar booking Komting (`/komting/bookings`) dan detail booking (`/komting/bookings/[id]`) beserta tampilan QR opaque (`GET /api/v1/komting/bookings/{id}/qr`) dan pembatalan booking jika diizinkan.
- Halaman riwayat peminjaman Komting (`/komting/loans`) dan profil/assignment (`/komting/profile`).
