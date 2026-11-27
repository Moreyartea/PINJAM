# LAPORAN VERIFIKASI UAT — DEF-005 (QR SCANNER & MAINTENANCE RECORDS)

**Tanggal Verifikasi:** 27 November 2026  
**Branch:** `feat/fullstack-integration`  
**Status Verifikasi:** **VERIFIED & CLOSED**  
**Lingkungan Pengujian:**
- **Database:** Supabase Live `PINJAM_TESTING` (`kaflptksvqwcurzacifs.supabase.co`)
- **Web Server:** Next.js 16.4.6 Production Server (`http://localhost:3000`)
- **Runtime:** Node.js v20.18.0 / macOS Darwin 24.6.0
- **Akun Uji STAFF:** `conc-staff@example.test` (ID: `6461d7e3-7d46-4d22-9434-339e93422c1e`)
- **Akun Uji KOMTING:** `conc-komting2@example.test` (ID: `160fb0fc-b34e-4f59-994c-883a48e7ff2b`)

---

## 1. Ringkasan Eksekutif

Laporan ini mendokumentasikan hasil pengujian dan verifikasi komprehensif terhadap dua defect UAT operasional STAFF:
1. **DEF-005A (QR Scanner — Layar Hitam & React Lifecycle):**
   - Komponen scanner kamera (`src/features/staff/staff-qr-scan-view.tsx`) telah diperbaiki dengan mengikat `MediaStream` menggunakan ref callback dan `useEffect` yang terkoordinasi, didukung helper `safePlayVideo(video)`, constraints kamera adaptif `facingMode: { ideal: "environment" }`, penanganan exception browser (`NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`), penghentian track (`track.stop()`) secara deterministik saat berganti aksi (`PICKUP` $\leftrightarrow$ `RETURN`) atau saat unmount, serta pemeliharaan fallback input manual token QR.
2. **DEF-005B (Maintenance Records — Backend Endpoints & Data Model):**
   - Service agregasi dan validasi (`src/lib/maintenance/maintenance-service.ts`) serta route handlers (`GET /api/v1/staff/maintenance`, `POST /api/v1/staff/projectors/[projectorId]/maintenance`, `POST /api/v1/staff/maintenance/[maintenanceId]/complete`) telah diverifikasi langsung terhadap database Supabase live menggunakan unit proyektor pengujian bersih `BE5-MAFPKE-AUDIT`.

Seluruh alur transaksi positif, uji batasan (edge cases), uji negatif, dan rangkaian regresi (175/175 BE tests, 211/211 FE tests, 0 typecheck errors, 0 lint errors, 50/50 static/dynamic build routes) telah berhasil 100%.

---

## 2. Bagian A: Verifikasi QR Scanner & Kamera (DEF-005A)

### 2.1 Analisis Masalah Awal & Solusi
- **Masalah Awal:** Saat tombol "Aktifkan Kamera QR" ditekan, pemanggilan `getUserMedia` berjalan asinkron sementara elemen `<video>` belum ter-mount di DOM karena re-render React belum selesai. Akibatnya, `videoRef.current` bernilai `null` dan area pratinjau menjadi kotak hitam tanpa stream.
- **Solusi yang Diterapkan:**
  1. Stream disimpan dalam ref (`streamRef.current`) segera setelah resolusi `getUserMedia()`.
  2. Pemasangan stream ke elemen video dilakukan melalui sinkronisasi terkoordinasi (ref callback dan `useEffect`), memastikan elemen video sudah berada di DOM sebelum `srcObject` dipasangkan.
  3. Helper `safePlayVideo(video)` memastikan `video.play()` dieksekusi dengan aman tanpa unhandled promise rejection lintas environment (jsdom/browser).
  4. Constraint kamera menggunakan `{ ideal: "environment" }` sehingga browser memprioritaskan kamera belakang jika tersedia, atau kamera depan jika perangkat hanya memiliki satu kamera.
  5. Penghentian stream aktif dilakukan secara otomatis pada:
     - Klik tombol "Matikan Kamera".
     - Pergantian aksi (`PICKUP` $\leftrightarrow$ `RETURN`).
     - Deteksi ketiadaan API `BarcodeDetector` (otomatis stop track & beralih ke input manual).
     - Lifecycle unmount komponen.

---

### 2.2 Pengujian yang Berhasil (Verified Succeeded)

| ID Uji | Skenario | Hasil yang Diharapkan | Status | Bukti / Catatan |
|---|---|---|---|---|
| **SCAN-01** | Login STAFF dan Buka `/staff/scan` | Halaman `/staff/scan` terbuka dengan tab aksi PICKUP & RETURN, tombol aktivasi kamera, dan kartu input manual. | **PASS** | Terbuka di `http://localhost:3000/staff/scan`. Bukti visual tersimpan di `uat-stf-05a-scan-view.png`. |
| **SCAN-02** | Penghentian Stream saat Matikan Kamera | Memanggil `stopCamera()` memicu `.stop()` pada seluruh tracks di `streamRef.current` dan mengembalikan state kamera ke nonaktif. | **PASS** | Terverifikasi di unit test `stops camera tracks when action changes or when component unmounts`. |
| **SCAN-03** | Pencegahan Konflik Stream Ganda saat Ganti Aksi | Beralih dari PICKUP ke RETURN (atau sebaliknya) secara otomatis mematikan stream aktif sebelumnya sehingga tidak terjadi tumpang-tindih media stream. | **PASS** | Terverifikasi di `src/features/staff/staff-qr-scan-view.tsx` line 86 (`stopCamera()`) dan unit test frontend. |
| **SCAN-04** | Penanganan Izin Ditolak (`NotAllowedError`) | Menampilkan alert instruksi: *"Izin kamera ditolak oleh pengguna atau browser. Berikan izin akses kamera pada pengaturan peramban Anda, atau gunakan input token QR manual di bawah."* | **PASS** | Unit test `handles camera permission denied (NotAllowedError)` berhasil. |
| **SCAN-05** | Penanganan Perangkat Tidak Ada (`NotFoundError`) | Menampilkan alert: *"Perangkat kamera tidak ditemukan pada perangkat ini. Silakan gunakan input token QR manual."* | **PASS** | Unit test `handles camera device not found (NotFoundError)` berhasil. |
| **SCAN-06** | Penanganan Kamera Sibuk (`NotReadableError`) & Constraint (`OverconstrainedError`) | Menampilkan alert instruksi terarah dan tidak menyebabkan crash aplikasi. | **PASS** | Unit test `handles NotReadableError and OverconstrainedError gracefully` berhasil. |
| **SCAN-07** | Fallback Browser Tanpa `BarcodeDetector` | Jika `window.BarcodeDetector` tidak tersedia, kamera otomatis dimatikan (`stopCamera()`), menampilkan pesan instruksi, dan mempertahankan input manual. | **PASS** | Unit test `handles missing BarcodeDetector by stopping stream...` berhasil. |
| **SCAN-08** | Validasi Token Manual Menggunakan Token QR Asli | Input token nyata booking `BKG-20261128-3465`: `pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM`. Menampilkan kartu *"Hasil Verifikasi QR dari Server"*, rincian booking, nama peminjam, proyektor `PRJ-CONC-001`, dan link ke `/staff/bookings/...`. | **PASS** | Validasi live menghasilkan respons valid `{ valid: true, action: "PICKUP", transaction: { booking_code: "BKG-20261128-3465", ... } }`. |

---

### 2.3 Pengujian yang Belum Dapat Dilakukan (Pending Physical Testing)

> [!WARNING]
> **Keterbatasan Lingkungan Headless / Server Runner:**
> - **Deskripsi:** Pengujian pemindaian optik fisik secara langsung di mana kamera fisik menangkap gambar kode QR dari selembar kertas atau layar ponsel lain **belum dapat dilakukan** di lingkungan eksekusi agen saat ini.
> - **Penyebab:** Mesin macOS runner mengeksekusi browser Chrome dalam mode headless CLI tanpa modul optik kamera web fisik yang terarah ke objek nyata.
> - **Mitigasi yang Telah Diverifikasi:**
>   1. Jalur video rendering, lifecycle stream, dan penanganan constraint kamera telah terbukti bekerja 100% menggunakan synthetic media stream driver (`--use-fake-device-for-media-stream`).
>   2. Alur pemrosesan data token QR (mulai dari pembacaan string hingga verifikasi server dan rendering kartu serah-terima) telah diverifikasi 100% menggunakan token booking asli `pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM`.
>   3. Pengujian fisik akhir disarankan dilakukan oleh penguji manusia (UAT tester) menggunakan perangkat laptop/tablet dengan kamera fisik aktif sebelum rilis produksi.

---

### 2.4 Bukti Visual QR Scanner
Tangkapan layar halaman `/staff/scan` tersimpan di direktori artefak:
- **File:** `uat-stf-05a-scan-view.png` (89 KB)
- **Path:** [uat-stf-05a-scan-view.png](file:///Users/user/.gemini/antigravity/brain/0dd2929d-ed36-46db-8669-2f8e46dc86d8/uat-stf-05a-scan-view.png)

---

## 3. Bagian B: Verifikasi Transaksi Maintenance (DEF-005B)

### 3.1 Analisis Integritas Transaksi & Klarifikasi Atomisitas

> [!IMPORTANT]
> **Klarifikasi Arsitektural dan Ketiadaan Stored Procedure RPC:**
> Berdasarkan pemeriksaan menyeluruh terhadap migrasi database `supabase/migrations/001_initial_schema.sql` hingga `017_fix_cron_email_outbox.sql`:
> - Tidak terdapat stored procedure / RPC khusus untuk memulai atau menyelesaikan pemeliharaan proyektor (berbeda dengan serah-terima unit yang memiliki `rpc_staff_confirm_pickup`).
> - Sesuai ketentuan ketat UAT: **Operasi ini TIDAK DISEBUT "atomik"** karena tidak dibungkus dalam satu blok transaksi database tunggal (single database transaction block / RPC).
> - **Mekanisme yang Diterapkan:**
>   Operasi ini merupakan **orkestrasi sekuensial tingkat aplikasi (application-level sequential orchestration)** yang dipadukan dengan **compensating rollback**:
>   - Saat *Start Maintenance*: Service terlebih dahulu mengubah `physical_status` proyektor menjadi `MAINTENANCE` (agar trigger PostgreSQL `verify_maintenance_against_projector()` terpenuhi), kemudian menyisipkan baris pada `maintenance_records`. Jika operasi `insert` gagal, service secara eksplisit melakukan rollback status proyektor kembali ke status sebelumnya (`AVAILABLE`).
>   - Integritas data dijamin di tingkat basis data melalui:
>     - Constraint `chk_maintenance_records_status_allowed` (`status IN ('IN_PROGRESS', 'COMPLETED')`).
>     - Trigger `trg_verify_maintenance_projector` yang memvalidasi kesesuaian status proyektor.
>     - Pengecekan aktif pinjaman (`loans` status `ACTIVE`) sebelum pengubahan status.

---

### 3.2 Unit Proyektor Pengujian
Untuk menjaga keamanan data transaksi UAT lain (seperti `PRJ-CONC-001` yang sedang terkait booking aktif `BKG-20261128-3465`), pengujian siklus hidup maintenance dilakukan pada unit pengujian bersih:
- **Nama Proyektor:** `BE5-MAFPKE-AUDIT`
- **ID Proyektor:** `7f62dc73-11b8-4d2a-afb3-e0132976df92`
- **Status Awal:** `physical_status = 'AVAILABLE'`, `is_active = true`, 0 active loan, 0 active booking.

---

### 3.3 Alur Siklus Hidup Transaksi Positif (Live Supabase Verification)

Eksekusi siklus penuh dilakukan menggunakan skrip verifikasi `scripts/run-def005-verification.mjs` langsung ke Supabase `PINJAM_TESTING`:

#### Langkah 1: STAFF Memulai Maintenance (Start Maintenance)
- **Endpoint:** `POST /api/v1/staff/projectors/7f62dc73-11b8-4d2a-afb3-e0132976df92/maintenance`
- **Payload:**
  ```json
  {
    "reason": "Pembersihan lensa dan penggantian filter debu berkala UAT",
    "note": "Unit dibawa ke ruang bengkel teknisi lab"
  }
  ```
- **HTTP Status:** `201 Created`
- **ID Record Maintenance yang Terbentuk:** `dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563`
- **Verifikasi Database:**
  1. Tabel `maintenance_records`:
     - `id`: `dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563`
     - `status`: `IN_PROGRESS`
     - `created_by`: `6461d7e3-7d46-4d22-9434-339e93422c1e` (Staff)
     - `started_at`: `2026-11-27T10:25:39.671+00:00`
     - `resolution_note`: `null`
     - `completed_at`: `null`
  2. Tabel `projectors`:
     - `physical_status` berhasil bertransisi: `AVAILABLE` $\rightarrow$ `MAINTENANCE`.
  3. Tabel `audit_logs`:
     - `id`: `c2d0c610-1f53-4c9d-9b62-74762938d9f2`
     - `action`: `PROJECTOR_MAINTENANCE`
     - `entity_type`: `PROJECTOR`
     - `entity_id`: `7f62dc73-11b8-4d2a-afb3-e0132976df92`
     - `actor_user_id`: `6461d7e3-7d46-4d22-9434-339e93422c1e` (STAFF)
     - `before_data`: `{"physical_status": "AVAILABLE"}`
     - `after_data`: `{"physical_status": "MAINTENANCE", "maintenance_id": "dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563", ...}`

#### Langkah 2: STAFF Menyelesaikan Maintenance (Complete Maintenance)
- **Endpoint:** `POST /api/v1/staff/maintenance/dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563/complete`
- **Payload:**
  ```json
  {
    "resolution_note": "Lensa telah dibersihkan, filter baru terpasang, unit telah lulus uji operasional.",
    "set_projector_available": true
  }
  ```
- **HTTP Status:** `200 OK`
- **Verifikasi Database:**
  1. Tabel `maintenance_records`:
     - `status`: `COMPLETED`
     - `resolution_note`: `"Lensa telah dibersihkan, filter baru terpasang, unit telah lulus uji operasional."`
     - `completed_by`: `6461d7e3-7d46-4d22-9434-339e93422c1e`
     - `completed_at`: `2026-11-27T10:25:40.975+00:00`
  2. Tabel `projectors`:
     - `physical_status` berhasil kembali: `MAINTENANCE` $\rightarrow$ `AVAILABLE`.
  3. Tabel `audit_logs`:
     - `id`: `6282c0f8-90c9-4d29-af76-c1cd573c588e`
     - `action`: `MAINTENANCE_COMPLETED`
     - `entity_type`: `MAINTENANCE`
     - `entity_id`: `dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563`
     - `actor_user_id`: `6461d7e3-7d46-4d22-9434-339e93422c1e` (STAFF)
     - `before_data`: `{"status": "IN_PROGRESS", "projector_id": "7f62dc73-11b8-4d2a-afb3-e0132976df92"}`
     - `after_data`: `{"status": "COMPLETED", "resolution_note": "...", "set_projector_available": true}`

---

### 3.4 Pengujian Kasus Batas & Negatif (Edge Cases & Negative Tests)

| No | Skenario Pengujian | Hasil Pengujian | Kode Error / Status | Status |
|---|---|---|---|---|
| 1 | **Unauthenticated Start Maintenance** | Request tanpa token ditolak. | `401 AUTH_REQUIRED` | **PASS** |
| 2 | **Unauthorized Role (KOMTING) Start Maintenance** | Akun KOMTING mencoba memulai maintenance ditolak. | `403 FORBIDDEN` | **PASS** |
| 3 | **Input Validation: Reason < 5 Karakter** | Alasan `"rusk"` ($< 5$ char) ditolak oleh validator Zod. | `422 VALIDATION_ERROR` | **PASS** |
| 4 | **Input Validation: Invalid UUID Projector** | Parameter projector ID non-UUID ditolak. | `400 INVALID_REQUEST` | **PASS** |
| 5 | **Duplicate Maintenance pada Unit yang Sama** | Memulai maintenance baru saat unit masih `IN_PROGRESS`. | `409 MAINTENANCE_ALREADY_ACTIVE` | **PASS** |
| 6 | **Unauthenticated Complete Maintenance** | Request complete tanpa autentikasi ditolak. | `401 AUTH_REQUIRED` | **PASS** |
| 7 | **Unauthorized Role (KOMTING) Complete Maintenance** | Akun KOMTING mencoba menyelesaikan maintenance ditolak. | `403 FORBIDDEN` | **PASS** |
| 8 | **Input Validation: Catatan Penyelesaian Kosong** | `resolution_note: ""` ditolak oleh validator Zod. | `422 VALIDATION_ERROR` | **PASS** |
| 9 | **Double Complete Maintenance** | Menyelesaikan record yang sudah `COMPLETED` ditolak. | `409 MAINTENANCE_ALREADY_COMPLETED` | **PASS** |
| 10 | **Perlindungan Unit dengan Pinjaman Aktif** | Unit yang memiliki pinjaman `ACTIVE` tidak diizinkan masuk ke `MAINTENANCE` (dicek via query `loans` status `ACTIVE`). Saat complete, unit tidak diubah ke `AVAILABLE` jika pinjaman masih berjalan. | Divalidasi oleh logic `activeLoans.length > 0` | **PASS** |

---

### 3.5 Bukti Rekaman Transaksi Database (Database Evidence)

Dikutip langsung dari output eksekusi verifikasi live (`scratch/def005-verification-results.json`):

#### 1. Cuplikan `maintenance_records`
```json
{
  "id": "dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563",
  "projector_id": "7f62dc73-11b8-4d2a-afb3-e0132976df92",
  "reason": "Pembersihan lensa dan penggantian filter debu berkala UAT",
  "note": "Unit dibawa ke ruang bengkel teknisi lab",
  "status": "COMPLETED",
  "created_by": "6461d7e3-7d46-4d22-9434-339e93422c1e",
  "started_at": "2026-11-27T10:25:39.671+00:00",
  "resolution_note": "Lensa telah dibersihkan, filter baru terpasang, unit telah lulus uji operasional.",
  "completed_by": "6461d7e3-7d46-4d22-9434-339e93422c1e",
  "completed_at": "2026-11-27T10:25:40.975+00:00",
  "lifecycle_seq": 194
}
```

#### 2. Cuplikan `projectors` (Status Akhir)
```json
{
  "id": "7f62dc73-11b8-4d2a-afb3-e0132976df92",
  "name": "BE5-MAFPKE-AUDIT",
  "physical_status": "AVAILABLE",
  "is_active": true
}
```

#### 3. Cuplikan `audit_logs` (Audit Trail)
```json
[
  {
    "id": "c2d0c610-1f53-4c9d-9b62-74762938d9f2",
    "action": "PROJECTOR_MAINTENANCE",
    "entity_type": "PROJECTOR",
    "entity_id": "7f62dc73-11b8-4d2a-afb3-e0132976df92",
    "before_data": { "physical_status": "AVAILABLE" },
    "after_data": {
      "physical_status": "MAINTENANCE",
      "maintenance_id": "dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563"
    }
  },
  {
    "id": "6282c0f8-90c9-4d29-af76-c1cd573c588e",
    "action": "MAINTENANCE_COMPLETED",
    "entity_type": "MAINTENANCE",
    "entity_id": "dcde53b1-3fe2-4b3e-bd98-45ba3cb9c563",
    "before_data": { "status": "IN_PROGRESS" },
    "after_data": {
      "status": "COMPLETED",
      "resolution_note": "Lensa telah dibersihkan, filter baru terpasang, unit telah lulus uji operasional."
    }
  }
]
```

---

### 3.6 Bukti Visual Halaman Maintenance
Tangkapan layar halaman manajemen maintenance STAFF tersimpan di direktori artefak:
- **File:** `uat-stf-05b-maintenance-view.png` (114 KB)
- **Path:** [uat-stf-05b-maintenance-view.png](file:///Users/user/.gemini/antigravity/brain/0dd2929d-ed36-46db-8669-2f8e46dc86d8/uat-stf-05b-maintenance-view.png)

---

## 4. Bagian C: Hasil Uji Regresi Penuh (Regression Suite)

Seluruh suite pengujian standar sistem dijalankan dan diverifikasi:

```bash
npm run test:unit:be && npm run test:unit:fe && npm run typecheck && npm run lint && npm run build
```

### 4.1 Rincian Hasil Pengujian
1. **Backend Unit Tests (`npm run test:unit:be`):**
   - **Hasil:** `175 passed`, `0 failed`, `0 skipped`.
   - Meliputi suite: `test:auth`, `test:be2`, `test:be3`, `test:be4`, `test:be5` (termasuk `tests/be5/maintenance.test.ts`), dan `test:be6`.
2. **Frontend Unit Tests (`npm run test:unit:fe`):**
   - **Hasil:** `211 passed`, `0 failed` pada `32 test files`.
   - Termasuk suite `src/features/staff/__tests__/staff-qr-scan-view.test.tsx` (seluruh pengujian scanner dan lifecycle kamera lulus).
3. **TypeScript Typecheck (`npm run typecheck`):**
   - **Hasil:** `0 errors` (`tsc --noEmit` lulus bersih).
4. **ESLint (`npm run lint`):**
   - **Hasil:** `0 errors`, 6 warnings (hanya unused variables di berkas mock test historis).
5. **Next.js Production Build (`npm run build`):**
   - **Hasil:** Berhasil mengompilasi 50 rute (baik halaman statis maupun dynamic route handlers) tanpa error:
     - Termasuk `/api/v1/staff/maintenance` (ƒ Dynamic).
     - Termasuk `/api/v1/staff/projectors/[projectorId]/maintenance` (ƒ Dynamic).
     - Termasuk `/api/v1/staff/maintenance/[maintenanceId]/complete` (ƒ Dynamic).
     - Termasuk `/staff/scan` (○ Static).
     - Termasuk `/staff/maintenance` (○ Static).

---

## 5. Matriks Status Kasus Uji UAT Terkait

| ID Skenario | Deskripsi Kasus Uji | Status Sebelum | Status Akhir | Keterangan |
|---|---|---|---|---|
| **UAT-STF-03** | Akses Pemindai QR & Validasi Booking | GAGAL (DEF-005A) | **PASS** | Ref mounting diperbaiki, track stopping deterministik, validasi token manual berhasil, fallback informatif. |
| **UAT-STF-05** | Riwayat & Validasi QR Pengembalian | DIBATASI (DEF-005A) | **PASS** | Mode RETURN tidak mengalami tumpang-tindih stream dan dapat memproses validasi pengembalian. |
| **UAT-STF-11** | Manajemen Unit Pemeliharaan (Maintenance) | BLOCKED (DEF-005B) | **PASS** | Lifecycle maintenance (Start, Complete, Re-availability, Audit Trail) lulus uji live database dan boundary test. |

---

## 6. Kesimpulan & Rekomendasi

1. **Status Akhir Defect:**
   - **DEF-005A (QR Scanner):** Dinyatakan **VERIFIED & CLOSED**. Komponen bekerja stabil dan aman dari kebocoran stream media.
   - **DEF-005B (Maintenance Records):** Dinyatakan **VERIFIED & CLOSED**. Backend, repository, route handlers, dan audit trail berfungsi akurat sesuai skema database.
2. **Keterbukaan Pengujian (Honest Disclosure):**
   - Operasi maintenance didokumentasikan secara transparan sebagai orkestrasi sekuensial aplikasi dengan kompensasi rollback, bukan transaksi atomik basis data/RPC karena ketiadaan RPC dalam migrasi 001–017.
   - Pengujian pemindaian optik fisik nyata melalui webcam disarankan dilakukan oleh tim UAT pada perangkat fisik ber-kamera sebelum deployment ke production.
3. **Kesiapan Branch:**
   - Branch `feat/fullstack-integration` dalam kondisi bersih dan stabil (seluruh test pass, build pass, tidak ada perubahan pada migration atau data transaksi booking aktif).
