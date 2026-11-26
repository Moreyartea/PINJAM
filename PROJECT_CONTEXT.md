# PROJECT CONTEXT — PINJAM

**Terakhir Diperbarui:** 26 November 2026  
**Sprint Terakhir:** Sprint FE-0 — Fondasi Frontend  
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
└── src/
    ├── app/
    │   ├── forbidden/
    │   │   └── page.tsx
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── not-found.tsx
    │   └── page.tsx
    ├── components/
    │   ├── feedback/
    │   │   ├── alert.tsx
    │   │   ├── empty-state.tsx
    │   │   ├── error-state.tsx
    │   │   └── loading-state.tsx
    │   ├── layout/
    │   │   └── app-shell.tsx
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
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts
    │   │   ├── errors.ts
    │   │   └── types.ts
    │   ├── config/
    │   │   └── env.ts
    │   └── utils/
    │       ├── cn.ts
    │       ├── date.ts
    │       └── idempotency.ts
    ├── services/
    │   ├── api/
    │   │   └── api-services.ts
    │   ├── mock/
    │   │   ├── mock-adapter.ts
    │   │   └── mock-services.ts
    │   ├── contracts.ts
    │   └── index.ts
    └── types/
        └── domain.ts
```

---

## 4. Konfigurasi Penting

- **`tsconfig.json`:** Mode ketat (`strict: true`, `noUncheckedIndexedAccess: true`), path alias `@/*` mengarah ke `./src/*`.
- **`eslint.config.mjs`:** Flat config ESLint 9 menggunakan `eslint-config-next/core-web-vitals` dan `eslint-config-next/typescript`.
- **`next.config.ts`:** `reactStrictMode: true`.
- **`.env.example` & `src/lib/config/env.ts`:**
  - `NEXT_PUBLIC_APP_NAME` (default `PINJAM`)
  - `NEXT_PUBLIC_API_BASE_URL` (base URL backend tanpa `/api/v1`)
  - `NEXT_PUBLIC_APP_TIMEZONE` (default `Asia/Jakarta`)
  - `NEXT_PUBLIC_USE_MOCK_API` (hanya aktif saat `NODE_ENV !== "production"` dan bernilai `"true"`; otomatis nonaktif di production).
  - Tidak ada secret/service-role key pada variabel `NEXT_PUBLIC_*`.

---

## 5. Design System (Neubrutalism)

- **Tokens (`src/styles/tokens.css`):**
  - Latar & teks: `--color-bg` (`#f7f7f2`), `--color-surface` (`#ffffff`), `--color-ink` (`#171717`), `--color-muted` (`#525252`).
  - Warna aksen & semantik: `--color-primary` (`#c8f169`), `--color-secondary` (`#b8d9ff`), `--color-accent` (`#ff8f70`), `--color-warning` (`#ffd166`), `--color-danger` (`#ff6b6b`), `--color-success` (`#8bd3a8`).
  - Border & shadow keras: `--border-width` (`2px`), `--border-color` (`#171717`), `--shadow-x` (`4px`), `--shadow-y` (`4px`), `--shadow-color` (`#171717`).
  - Radius: `--radius-sm` (`6px`), `--radius-md` (`10px`), `--radius-lg` (`14px`).
- **Baseline interaksi & aksesibilitas (`src/app/globals.css`):**
  - Kelas utilitas `.nb-border`, `.nb-border-strong`, `.nb-shadow`, `.nb-shadow-sm`, `.nb-shadow-lg`, `.nb-interactive`.
  - Focus ring kontras tinggi (`:focus-visible` outline `3px solid #171717`), skip-link `#main-content` pada `RootLayout`, status tidak hanya mengandalkan warna (`StatusBadge` menyertakan simbol + label teks + fallback `UNKNOWN`).

---

## 6. Komponen yang Sudah Dibuat

- **UI Primitives (`src/components/ui/`):**
  - `Button`: varian `primary`, `secondary`, `accent`, `warning`, `danger`, `outline`, `ghost`; ukuran `sm`, `md`, `lg`; state `isLoading` + `aria-busy` untuk mencegah double-submit.
  - `FormField`, `Input`, `Textarea`, `Select`: label eksplisit, penanda `required`, `hint`, `error` (`role="alert"` + `aria-describedby`).
  - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
  - `Badge`, `StatusBadge`: memetakan seluruh enum domain (`ProjectorPhysicalStatus`, `BookingStatus`, `LoanStatus`, `ApplicationStatus`, `AssignmentStatus`, `MaintenanceStatus`, dll.) dengan fallback aman `UNKNOWN`.
  - `Spinner`, `Skeleton`.
  - `Dialog`, `ConfirmDialog`: modal aksesibel dengan `Escape` handler dan pengembalian fokus keyboard.
  - `icons.tsx`: ikon SVG inline ringan tanpa dependensi paket tambahan.
- **Feedback (`src/components/feedback/`):** `Alert`, `LoadingState`, `EmptyState`, `ErrorState`.
- **Layout (`src/components/layout/`):** `AppShell` (topbar, sidebar desktop, drawer navigasi mobile, indikator `DEV MOCK`), `PageHeader`.

---

## 7. API Client & Service Layer yang Disiapkan

- **`src/lib/api/types.ts`:** Tipe envelope `ApiSingleResponse<T>`, `ApiListResponse<T>`, `ApiErrorResponse`, `PaginationMeta`, `ListQueryParams`, serta seluruh 27 `ContractErrorCode` dari `API_CONTRACT_PINJAM.md` §15.
- **`src/lib/api/errors.ts`:** `ApiClientError`, `normalizeUnknownError`, `getSafeErrorMessage`, dan `getFieldErrors()` tanpa membocorkan detail internal server.
- **`src/lib/api/client.ts`:** Fungsi `apiRequest` terpusat dengan prefix `/api/v1`, dukungan `setAccessTokenProvider` (`Authorization: Bearer <token>`), `Idempotency-Key`, penanganan `FormData` tanpa memaksa header `Content-Type`, dan timeout (`AbortController`).
- **`src/services/contracts.ts`:** Interface 12 service domain sesuai `FRONTEND_SPEC_PINJAM.md` §12.4 (`auth`, `me`, `application`, `projector`, `availability`, `booking`, `loan`, `qr`, `maintenance`, `operatingHours`, `admin`, `auditLog`).
- **`src/services/api/api-services.ts`:** Implementasi HTTP nyata sesuai endpoint `API_CONTRACT_PINJAM.md`.
- **`src/services/mock/mock-adapter.ts` & `mock-services.ts`:** Adapter mock khusus development dengan simulasi latensi dan skenario (`success`, `empty`, `validation_error`, `unauthorized`, `conflict`) serta stub respons sesuai bentuk kontrak.
- **`src/services/index.ts`:** Entry point tunggal `services` yang otomatis memilih `mockServices` atau `apiServices` berdasarkan `env.useMockApi`.

---

## 8. File Penting Beserta Fungsinya

| File | Fungsi |
|---|---|
| `src/styles/tokens.css` | Definisi CSS variables Neubrutalism |
| `src/app/globals.css` | Konfigurasi Tailwind v4 dan utilitas Neubrutalism |
| `src/app/layout.tsx` | Root layout, font loading, metadata, skip link |
| `src/app/page.tsx` | Halaman baseline verifikasi fondasi FE-0 |
| `src/app/forbidden/page.tsx` | Halaman baseline `403` akses ditolak |
| `src/lib/config/env.ts` | Pembacaan env client-safe dan guard mock mode |
| `src/lib/api/client.ts` | HTTP client terpusat `/api/v1` |
| `src/lib/api/errors.ts` | Normalisasi error API dan mapping pesan aman |
| `src/types/domain.ts` | Tipe domain & enum frontend sesuai kontrak |
| `src/services/contracts.ts` | Kontrak interface 12 service domain |
| `src/services/index.ts` | Registry pemilih adapter API vs mock |

---

## 9. Status Implementasi

- **Selesai (Sprint FE-0):**
  - Inisialisasi project Next.js App Router + TypeScript + Tailwind CSS v4 + ESLint + Prettier.
  - Design system Neubrutalism (tokens, typography, borders, shadows, focus ring, responsive layout shell).
  - Komponen UI dasar, feedback states, dan dialog konfirmasi.
  - Abstraksi API client, normalisasi error, tipe kontrak domain, service interfaces, dan mock adapter development.
  - Halaman baseline `/` (preview fondasi FE-0), `/forbidden`, dan `not-found`.

---

## 10. Hal yang Belum Dikerjakan

- **Sprint FE-1 (Auth & KOMTING):** Login/session provider, `/me`, role guard & routing per role, form pendaftaran komting + upload foto identitas, status pengajuan, dashboard komting, daftar proyektor.
- **Sprint FE-2 (Booking):** Availability check, form booking per menit dengan `Idempotency-Key`, daftar/detail booking, tampilan QR booking, riwayat loan.
- **Sprint FE-3 (STAFF Operasional):** Dashboard STAFF, daftar/detail booking operasional, QR scanner kamera + fallback manual, konfirmasi pickup, form return inspection + upload foto bukti, daftar loan & maintenance.
- **Sprint FE-4 (ADMIN):** Dashboard ADMIN, review/approve/reject/replacement pengajuan komting, manajemen assignment, manajemen akun STAFF (endpoint detail masih perlu disepakati), inventaris proyektor, jam operasional, audit log, koreksi transaksi.
- **Sprint FE-5 (Hardening):** Unit/integration/E2E testing, integrasi endpoint backend nyata, penyempurnaan responsif & aksesibilitas menyeluruh.
- **Backend (BE-0 s.d. BE-8):** Belum diimplementasikan pada tahap ini.

---

## 11. Kendala, Keputusan Teknis, & Open Decisions

1. **Kondisi Git Repository:** Workspace awal belum diinisialisasi sebagai repository Git (`.git` belum ada, sehingga branch `main` maupun `staging` belum tersedia). Implementasi FE-0 dilakukan tanpa membuat repository/branch Git secara sepihak; inisialisasi Git & branch `staging` menunggu arahan tim.
2. **Ikon UI:** Menggunakan komponen SVG inline ringan di `src/components/ui/icons.tsx` untuk menghindari penambahan package ikon eksternal yang belum diperlukan pada FE-0.
3. **Open Decisions dari Dokumen (belum diputuskan dan ditandai agar tidak ditebak):**
   - Provider autentikasi final (misalnya Supabase Auth) & mekanisme refresh token.
   - Field identitas mahasiswa final pada form registrasi komting (`student_id` / NIM dan validasi email sebelum pengajuan).
   - Mekanisme respons komting lama dan tenggat waktu pada alur replacement.
   - Batas waktu/status pembatalan booking oleh komting.
   - Detail endpoint pengelolaan akun STAFF oleh ADMIN (belum dirinci di `API_CONTRACT_PINJAM.md`).
   - Kebijakan ukuran, tipe MIME, signed upload/URL, dan retensi file foto.
   - Daftar field allowlist koreksi transaksi ADMIN.
   - Kebutuhan inbox notifikasi internal aplikasi vs email saja.
