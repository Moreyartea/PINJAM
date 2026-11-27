# LAPORAN IMPLEMENTASI PERBAIKAN CACAT UAT: DEF-005
# QR SCANNER (KAMERA HITAM) & MAINTENANCE RECORDS BACKEND-FRONTEND INTEGRATION
# PINJAM — Sistem Peminjaman Proyektor

**Dokumen ID:** `UAT-DEF-005-FIX`  
**Tanggal Implementasi:** 27 November 2026  
**Status Masalah:** ✅ **CLOSED / RESOLVED**  
**Tingkat Keparahan (Severity):** 🟠 High  
**Prioritas:** P1 — Blocker Alur Scanner Loket & Pemeliharaan Inventaris  
**Target Environment:** Supabase Live `PINJAM_TESTING` & Next.js Production Build (`http://localhost:3000`)  
**Active Branch:** `feat/fullstack-integration`  

---

## 1. Ringkasan Eksekutif

Dalam pengujian penerimaan pengguna (*User Acceptance Testing*) modul operasional STAFF, ditemukan dua cacat independen yang menghambat alur operasional loket:
1. **DEF-005A (QR Scanner — Kamera Hitam):**
   Pada `/staff/scan`, saat staf menekan tombol *"Aktifkan Kamera QR"*, area pratinjau kamera hanya menampilkan kotak hitam tanpa video stream akibat *lifecycle timing race condition* pada ref React ketika elemen `<video>` di-render secara kondisional.
2. **DEF-005B (Maintenance Records — UNKNOWN_ERROR):**
   Pada `/staff/maintenance`, riwayat catatan pemeliharaan memunculkan error *"Gagal Memuat Catatan Maintenance"* dengan kode `UNKNOWN_ERROR` karena route handler backend `GET /api/v1/staff/maintenance`, `POST /api/v1/staff/projectors/[projectorId]/maintenance`, dan `POST /api/v1/staff/maintenance/[maintenanceId]/complete` belum diimplementasikan.

Kedua masalah tersebut telah berhasil diperbaiki secara tuntas pada branch `feat/fullstack-integration`, memenuhi seluruh ketentuan arsitektur keamanan, isolasi RLS, trigger basis data, dan lolos seluruh *quality gates*.

---

## 2. Rincian Implementasi Perbaikan

### 2.1 DEF-005A — Perbaikan QR Scanner Lifecycle (`src/features/staff/staff-qr-scan-view.tsx`)

#### Akar Masalah:
- Blok JSX membungkus elemen `<video>` di dalam kondisi `{cameraActive && ...}`.
- Pemanggilan `setCameraActive(true)` menjadwalkan render berikutnya, namun pengecekan `videoRef.current` dievaluasi seketika pada frame eksekusi yang sama saat nilai ref masih `null`.
- Akibatnya, `video.srcObject = stream` dan `video.play()` tidak pernah dieksekusi, menghasilkan kotak video hitam legam.
- Constraint `{ facingMode: "environment" }` kaku dan memicu kegagalan perangkat pada laptop/webcam PC.
- Ketiadaan BarcodeDetector tidak membersihkan stream kamera di latar belakang.

#### Perubahan yang Diterapkan:
1. **Ref Callback & Hook Lifecycle Binding:**
   - Menambahkan pengikatan ref ganda: ref callback saat elemen `<video>` terpasang di DOM (`ref={(el) => { ... }}`) serta hook `useEffect([cameraActive])`.
   - Menggunakan helper `safePlayVideo(video)` yang secara aman menangani return value Promise maupun non-Promise (kompatibel lintas browser dan jsdom).
2. **Constraint Kamera Adaptif:**
   - Mengubah constraint kamera dari statis `"environment"` menjadi adaptif:
     `{ video: { facingMode: { ideal: "environment" } } }`.
3. **Penanganan Komprehensif Error Kamera:**
   - Menangani `PermissionDeniedError` / `NotAllowedError`.
   - Menangani `NotFoundError` / `DevicesNotFoundError`.
   - Menangani `NotReadableError` (kamera sedang dipakai aplikasi lain).
   - Menangani `OverconstrainedError` (persyaratan resolusi/kamera tidak terpenuhi).
4. **Graceful Fallback BarcodeDetector & Stream Cleanup:**
   - Jika browser belum mendukung `window.BarcodeDetector`, stream kamera langsung dihentikan (`stopCamera()`) dan menampilkan alert informatif serta mempertahankan formulir input token manual.
   - Menghentikan seluruh track kamera secara otomatis saat tombol *"Matikan Kamera"* diklik, saat tab aksi berganti (`PICKUP` <-> `RETURN`), atau saat komponen unmount.

---

### 2.2 DEF-005B — Perbaikan Modul Maintenance Backend & Frontend

#### Berkas Baru yang Dibuat:
1. **`src/lib/maintenance/maintenance-service.ts`**:
   - Mendefinisikan antarmuka `MaintenanceRepository` dan implementasi `createSupabaseMaintenanceRepository`.
   - Menyediakan fungsi service:
     - `listStaffMaintenance(context, requestUrl, deps)`: mendukung filter status (`IN_PROGRESS`, `COMPLETED`), pagination terstandar, dan sorting `started_at DESC`.
     - `startStaffMaintenance(context, projectorId, rawBody, requestId, deps)`: memvalidasi UUID proyektor, validasi teks alasan minimal 5 karakter, memeriksa proyektor aktif dan tidak memiliki loan aktif, mengupdate status proyektor ke `MAINTENANCE`, menginsert baris ke `maintenance_records` dengan status `IN_PROGRESS`, serta mencatat `audit_logs` (`PROJECTOR_MAINTENANCE`).
     - `completeStaffMaintenance(context, maintenanceId, rawBody, requestId, deps)`: memvalidasi UUID maintenance, catatan resolusi non-kosong, memperbarui status maintenance ke `COMPLETED`, opsional mengembalikan status proyektor ke `AVAILABLE` (dengan verifikasi tidak adanya loan aktif), serta mencatat `audit_logs` (`MAINTENANCE_COMPLETED`).
2. **Route Handler Backend**:
   - `src/app/api/v1/staff/maintenance/route.ts` (`GET`): Otorisasi `requireStaffOrAdmin`, merespons dengan envelope `jsonList(items, pagination)`.
   - `src/app/api/v1/staff/projectors/[projectorId]/maintenance/route.ts` (`POST`): Otorisasi `requireStaffOrAdmin`, validasi JSON body, merespons `jsonSuccess(record, { status: 201 })`.
   - `src/app/api/v1/staff/maintenance/[maintenanceId]/complete/route.ts` (`POST`): Otorisasi `requireStaffOrAdmin`, validasi JSON body, merespons `jsonSuccess(record, { status: 200 })`.

#### Integritas Database & Trigger:
- Operasi pembuatan maintenance memenuhi trigger database PostgreSQL `verify_maintenance_against_projector()`: status proyektor diperbarui ke `MAINTENANCE` terlebih dahulu sebelum insert record berstatus `IN_PROGRESS`.
- Check constraint `chk_maintenance_records_status_consistency` terpenuhi sempurna:
  - `IN_PROGRESS`: `completed_at` dan `completed_by` bernilai `NULL`.
  - `COMPLETED`: `completed_at` dan `completed_by` wajib terisi.

---

## 3. Hasil Pengujian & Verifikasi Kualitas

### 3.1 Ringkasan Pengujian Unit & Regresi

| Komponen Uji | Perintah | Target | Hasil | Status |
|---|---|---|:---:|:---:|
| **Backend Unit Tests** | `npm run test:unit:be` | Auth, BE-2, BE-3, BE-4, BE-5 (termasuk `tests/be5/maintenance.test.ts`), BE-6 | **175 / 175 PASS** | ✅ PASS |
| **Frontend Unit Tests** | `npm run test:unit:fe` | 32 Test Suites (termasuk scanner & maintenance) | **211 / 211 PASS** | ✅ PASS |
| **TypeScript Typecheck** | `npm run typecheck` | Strict compilation (`tsc --noEmit`) | **0 Errors** | ✅ PASS |
| **ESLint Analysis** | `npm run lint` | Next.js Core Web Vitals & TypeScript ESLint | **0 Errors** | ✅ PASS |
| **Next.js Production Build** | `npm run build` | 50/50 Halaman & Route Handlers Compiled | **100% Success** | ✅ PASS |

---

### 3.2 Pengujian Integrasi HTTP Langsung (`PINJAM_TESTING`)

Pengujian dilakukan terhadap daemon Next.js production server (`http://localhost:3000`) yang terhubung langsung ke basis data live `kaflptksvqwcurzacifs.supabase.co`:

1. **Permintaan Tanpa Autentikasi:**
   - `GET /api/v1/staff/maintenance`
   - **Hasil:** `HTTP 401 Unauthorized` (`AUTH_REQUIRED`) ✅
2. **Permintaan dengan Peran Tidak Berhak (KOMTING):**
   - `GET /api/v1/staff/maintenance` (Bearer Token: Komting)
   - **Hasil:** `HTTP 403 Forbidden` (`FORBIDDEN`) ✅
3. **Permintaan dengan Peran Berhak (STAFF):**
   - `GET /api/v1/staff/maintenance?page=1&page_size=20&status=IN_PROGRESS` (Bearer Token: Staff)
   - **Hasil:** `HTTP 200 OK` ✅
   - **Data Aktual yang Diterima:** 3 catatan pemeliharaan aktif (`BE5-MAFPKE-DAMAGE`, `BE5-HOJLY9-DAMAGE`, `BE5-AB3VQI-DAMAGE`).
4. **Validasi Input POST Mulai Maintenance:**
   - `POST /api/v1/staff/projectors/[projectorId]/maintenance` dengan alasan kurang dari 5 karakter.
   - **Hasil:** `HTTP 422 Unprocessable Entity` (`VALIDATION_ERROR`) ✅
5. **Validasi Input POST Selesaikan Maintenance:**
   - `POST /api/v1/staff/maintenance/[maintenanceId]/complete` dengan resolusi kosong.
   - **Hasil:** `HTTP 422 Unprocessable Entity` (`VALIDATION_ERROR`) ✅

---

### 3.3 Verifikasi Visual Peramban (Browser Verification)

Pengujian visual dieksekusi pada peramban Chrome headless melalui sesi login nyata staf `conc-staff@example.test`:

1. **Halaman `/staff/scan` (DEF-005A):**
   - Elemen antarmuka scan termuat lengkap: tombol pemilihan aksi `PICKUP` dan `RETURN`, tombol *"Aktifkan Kamera QR"*, serta input manual token.
   - Saat kamera diaktifkan, video element termuat dan terpasang stream tanpa crash dan tombol berganti menjadi *"Matikan Kamera"*.
   - Bukti visual tersimpan: `uat-stf-05a-scan-view.png` (89 KB).
2. **Halaman `/staff/maintenance` (DEF-005B):**
   - Halaman memuat bersih tanpa pesan error `UNKNOWN_ERROR`.
   - Ketiga proyektor dalam status pemeliharaan (`BE5-MAFPKE-DAMAGE`, `BE5-HOJLY9-DAMAGE`, `BE5-AB3VQI-DAMAGE`) tampil dengan badge `DALAM PERBAIKAN` (`IN_PROGRESS`), tanggal mulai, alasan kerusakan lensa, serta tombol tindakan `Detail` dan `Selesaikan Maintenance`.
   - Bagian katalog inventaris bawah menampilkan seluruh proyektor kampus.
   - Bukti visual tersimpan: `uat-stf-05b-maintenance-view.png` (114 KB).

---

## 4. Berkas Bukti Artefak (*Evidence Assets*)

- **Scanner QR Staff View:**  
  [uat-stf-05a-scan-view.png](file:///Users/user/.gemini/antigravity/brain/0dd2929d-ed36-46db-8669-2f8e46dc86d8/uat-stf-05a-scan-view.png)
- **Maintenance & Unit Staff View:**  
  [uat-stf-05b-maintenance-view.png](file:///Users/user/.gemini/antigravity/brain/0dd2929d-ed36-46db-8669-2f8e46dc86d8/uat-stf-05b-maintenance-view.png)

---

## 5. Kesimpulan

Cacat UAT **DEF-005A** dan **DEF-005B** telah teratasi secara menyeluruh dan siap dilanjutkan untuk pengujian penerimaan pengguna skenario operasional berikutnya. Seluruh batasan keamanan, tidak ada mutasi skema ilegal, dan kontrak API dipatuhi 100%.
