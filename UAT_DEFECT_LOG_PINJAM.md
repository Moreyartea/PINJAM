# LOG CACAT DAN KESENJANGAN PENGUJIAN PENERIMAAN (UAT DEFECT LOG)
# PINJAM — Sistem Peminjaman Proyektor

**Versi:** 1.0.0  
**Tanggal:** 27 November 2026  
**Status Dokumen:** Draf Aktif UAT (Active UAT Tracking Log)  
**Branch:** `feat/fullstack-integration`  
**Target Environment:** Supabase Live `PINJAM_TESTING` & Next.js Production Build  

---

## 1. Panduan Pengelolaan Defect UAT

Dokumen ini digunakan oleh tim penguji (*QA / Testers*), pengembang (*Developers*), dan pemilik produk (*Product Owner*) untuk mencatat, mengklasifikasikan, dan melacak penyelesaian setiap ketidaksesuaian (*defect / bug / discrepancy*) yang ditemukan selama pelaksanaan User Acceptance Testing (UAT).

### 1.1 Klasifikasi Tingkat Keparahan (Severity)

| Tingkat Severity | Definisi & Dampak | Batas Waktu Tindakan |
|---|---|---|
| 🔴 **Critical** | Kerusakan fatal sistem, crash aplikasi, kebocoran data keamanan/otorisasi, transaksi data korup, atau kegagalan total pada alur inti (misal: login gagal total, booking crash, return gagal total) tanpa solusi alternatif (*no workaround*). | Wajib diperbaiki segera (*Blocker Release*) |
| 🟠 **High** | Fitur fungsional utama tidak beroperasi sesuai PRD, aturan bisnis penting dilanggar (misal: Komting dapat membuat 2 booking aktif, atau proyektor maintenance dapat dipesan), dan tidak ada solusi sementara yang layak. | Wajib diselesaikan sebelum rilis produksi |
| 🟡 **Medium** | Fungsionalitas terganggu namun tersedia solusi sementara (*workaround*), masalah navigasi minor, inkonsistensi antarmuka UI Neubrutalism yang memengaruhi kenyamanan pengguna, atau pesan error yang membingungkan. | Diperbaiki sebelum rilis atau pada patch rilis awal |
| 🟢 **Low** | Masalah kosmetik murni, salah ketik teks (*typo*), perbedaan warna margin/padding minor, atau saran perbaikan antarmuka yang tidak menghalangi fungsionalitas sistem. | Dapat dijadwalkan pada siklus pemeliharaan berkala |

### 1.2 Klasifikasi Prioritas Penyelesaian (Priority)

- **P1 — Urgent:** Perbaikan mendesak, menghentikan pengujian skenario terkait.
- **P2 — High:** Perbaikan prioritas tinggi, harus diselesaikan sebelum penandatanganan rilis.
- **P3 — Normal:** Perbaikan standar sesuai antrean pengembangan.
- **P4 — Low:** Perbaikan minor atau penyempurnaan di masa mendatang.

### 1.3 Alur Status Defect

```
[ NEW ] ──> [ TRIAGED ] ──> [ IN_PROGRESS ] ──> [ READY_FOR_RETEST ] ──> [ CLOSED ]
                 │
                 └──> [ DEFERRED / KNOWN_GAP ]
```

---

## 2. Formulir Standar Pelaporan Defect

Setiap penguji yang menemukan defect baru wajib mengisi data sesuai format berikut:

```markdown
### DEFECT-XXX: [Judul Ringkas Cacat / Masalah]
- **Defect ID:** `DEFECT-XXX`
- **Test Case Terkait:** `UAT-XXX-XX`
- **Role Pengguna:** ADMIN / STAFF / KOMTING / PUBLIC
- **Halaman / URL:** `/path/to/page`
- **Severity:** Critical / High / Medium / Low
- **Priority:** P1 / P2 / P3 / P4
- **Status:** NEW
- **Pelapor:** [Nama Penguji]
- **Tanggal Ditemukan:** [YYYY-MM-DD]
- **Lingkungan UAT:** Browser (Chrome / Safari), Resolusi Layar, OS
- **Langkah Reproduksi (Steps to Reproduce):**
  1. ...
  2. ...
  3. ...
- **Hasil yang Diharapkan (Expected Result):** ...
- **Hasil Aktual (Actual Result):** ...
- **Tangkapan Layar / Bukti Error:** `EVIDENCE_DEFECT_XXX.png`
- **Catatan Teknis / Log Console:** [Jika ada error di tab F12]
```

---

## 3. Log Defect Pelaksanaan UAT

*(Tabel ini diisi secara dinamis oleh tim penguji saat eksekusi pengujian di lapangan berlangsung).*

| Defect ID | Test Case ID | Role | Judul Defect | Severity | Priority | Status | Assignee | Resolusi / Keterangan |
|---|---|---|---|:---:|:---:|:---:|---|---|
| `DEF-001` | `UAT-KMT-04` | `KOMTING` | Dashboard KOMTING Gagal Memuat (`UNKNOWN_ERROR` / 404 pada `/api/v1/komting/dashboard`) | 🟠 **High** | **P1** | **CLOSED** | Fullstack Dev | Implementasi route handler `src/app/api/v1/komting/dashboard/route.ts` dan service `src/lib/komting/komting-dashboard-service.ts`. 8/8 unit regression tests PASS, live Supabase PASS, dan visual browser PASS. |
| `DEF-002` | `UAT-KMT-06` | `KOMTING` | Formulir Booking Baru Menampilkan Waktu Lampau & Kurang Validasi Adaptif Jam Operasional | 🟡 **Medium** | **P2** | **CLOSED** | Fullstack Dev | Implementasi helper `getBookingTimeBounds`, default waktu adaptif di Asia/Jakarta, batasan HTML min/max, penonaktifan hari ini saat lewat jam operasional, validasi state di `validateBookingForm`, serta penambahan regression test di backend (155/155 BE PASS, 208/208 FE PASS, Live API 422 BOOKING_TIME_IN_PAST). |
| `DEF-003` | `UAT-KMT-11` | `KOMTING` | QR Booking Gagal Ditampilkan (`qr_tokens.token_hash is immutable`) pada Detail Booking | 🟠 **High** | **P1** | **CLOSED** | Fullstack Dev | Perbaikan `getBookingQrToken()` menjadi 100% read-only tanpa mutasi DB (`updateTokenForBooking` dieliminasi); fallback payload `idempotency_records` untuk booking lama (`BKG-20261128-3465`) & HMAC deterministik untuk booking baru via `QR_TOKEN_SECRET`. 8/8 regression tests PASS, live Supabase PASS, visual UI PASS. |
| `DEF-004` | `UAT-STF-01` | `STAFF` | Dashboard STAFF Gagal Memuat (`UNKNOWN_ERROR` / 404 pada `/api/v1/staff/dashboard`) | 🟠 **High** | **P1** | **CLOSED** | Fullstack Dev | Implementasi route handler `src/app/api/v1/staff/dashboard/route.ts` dan service agregator `src/lib/staff/staff-dashboard-service.ts`. 6/6 regression tests PASS (169/169 BE PASS, 208/208 FE PASS, 0 typecheck/lint errors), live Supabase PASS (200 OK), dan visual browser PASS (`uat-stf-04-staff-dashboard.png`). |
| `DEF-005A` | `UAT-STF-03` | `STAFF` | Preview Kamera QR Hitam pada Halaman `/staff/scan` Akibat Race Condition Ref | 🟠 **High** | **P1** | **CLOSED** | Fullstack Dev | Perbaikan binding ref MediaStream ganda (ref callback + useEffect), constraint kamera adaptif `facingMode: { ideal: "environment" }`, error handling NotAllowed/NotFound/NotReadable/Overconstrained, fallback BarcodeDetector dan cleanup stream saat tab beralih atau unmount. Visual browser PASS (`uat-stf-05a-scan-view.png`). |
| `DEF-005B` | `UAT-STF-11` | `STAFF` | Catatan Maintenance Gagal Memuat (`UNKNOWN_ERROR` / 404 pada `/api/v1/staff/maintenance`) | 🟠 **High** | **P1** | **CLOSED** | Fullstack Dev | Implementasi service `src/lib/maintenance/maintenance-service.ts` dan route handler `GET /api/v1/staff/maintenance`, `POST /api/v1/staff/projectors/[projectorId]/maintenance`, `POST /api/v1/staff/maintenance/[maintenanceId]/complete`. 6/6 unit regression tests PASS (175/175 BE PASS, 211/211 FE PASS), Live API 200/422 PASS, visual browser PASS (`uat-stf-05b-maintenance-view.png`). |

---

### DEF-004: Dashboard STAFF Gagal Memuat (UNKNOWN_ERROR / 404 pada `/api/v1/staff/dashboard`)
- **Defect ID:** `DEF-004`
- **Test Case Terkait:** `UAT-STF-01`
- **Role Pengguna:** STAFF
- **Halaman / URL:** `/staff`
- **Severity:** 🟠 High
- **Priority:** P1
- **Status:** **CLOSED**
- **Pelapor:** UAT Tester
- **Tanggal Ditemukan:** 2026-11-27
- **Lingkungan UAT:** Chrome / Chromium, Next.js Production Build, Supabase `PINJAM_TESTING`
- **Langkah Reproduksi (Steps to Reproduce):**
  1. Login menggunakan akun Staff aktif `conc-staff@example.test`.
  2. Buka dashboard operasional `/staff`.
  3. Amati bagian ringkasan operasional loket.
- **Hasil yang Diharapkan (Expected Result):**
  - Dashboard operasional berhasil menampilkan kartu ringkasan booking siap pickup, loan aktif, keterlambatan (overdue), dan unit maintenance.
  - Terdapat daftar antrean booking yang menunggu serah-terima dan daftar peminjaman aktif.
- **Hasil Aktual Sebelum Perbaikan (Actual Result):**
  - Tampil kartu error `"Gagal Memuat Dashboard STAFF"` dengan kode `UNKNOWN_ERROR`.
  - Frontend memanggil `GET /api/v1/staff/dashboard`, namun backend belum memiliki route handler tersebut sehingga mengembalikan HTTP 404 Not Found.
- **Tangkapan Layar Bukti:** `uat-stf-04-staff-dashboard.png`
- **Resolusi / Tindakan Perbaikan:**
  1. Membuat service agregator `src/lib/staff/staff-dashboard-service.ts` yang mengumpulkan data secara paralel (`Promise.all`) untuk booking siap pickup, booking hari ini, loan aktif, loan overdue, unit maintenance, dan riwayat aktivitas terkini dari `audit_logs`.
  2. Membuat route handler `src/app/api/v1/staff/dashboard/route.ts` dengan proteksi otorisasi `requireStaffOrAdmin()`.
  3. Menambahkan 6 unit regression tests pada `tests/be4/staff-dashboard.test.ts` (169/169 BE PASS, 208/208 FE PASS).
  4. Pengujian live API terhadap `PINJAM_TESTING` berhasil mengembalikan HTTP 200 OK dengan ringkasan lengkap.
  5. Pengujian visual antarmuka browser mengonfirmasi halaman `/staff` menampilkan dashboard operasional secara sempurna tanpa error.

---

### DEF-003: QR Booking Gagal Ditampilkan pada Detail Booking (`token_hash is immutable`)
- **Defect ID:** `DEF-003`
- **Test Case Terkait:** `UAT-KMT-11` (dan detail view pasca `UAT-KMT-07`)
- **Role Pengguna:** KOMTING
- **Halaman / URL:** `/komting/bookings/:id`
- **Severity:** 🟠 High
- **Priority:** P1
- **Status:** **CLOSED**
- **Pelapor:** UAT Tester
- **Tanggal Ditemukan:** 2026-11-27
- **Lingkungan UAT:** Chrome / Chromium, Next.js Production Build, Supabase `PINJAM_TESTING`
- **Langkah Reproduksi (Steps to Reproduce):**
  1. Login sebagai akun Komting aktif.
  2. Buat booking baru terkonfirmasi (`BKG-20261128-3465`).
  3. Buka halaman rincian pemesanan `/komting/bookings/:id`.
  4. Amati kartu tampilan QR Code.
- **Hasil yang Diharapkan (Expected Result):**
  - QR Code berhasil dirender dalam komponen SVG dengan token `pjmqr_v1_...`.
  - Endpoint GET QR bersifat murni *read-only* tanpa mencoba memperbarui token di database.
- **Hasil Aktual Sebelum Perbaikan (Actual Result):**
  - QR Code gagal ditampilkan, muncul error `qr_tokens.token_hash is immutable` (SQLSTATE `23514`).
  - Endpoint `GET /api/v1/komting/bookings/:id/qr` mencoba melakukan `UPDATE qr_tokens SET token_hash = ...` setiap pemanggilan sehingga memicu trigger pencegahan mutasi PostgreSQL `guard_qr_token_lifecycle()`.
- **Tangkapan Layar Bukti:** `uat-kmt-06-qr-booking-detail.png`
- **Resolusi / Tindakan Perbaikan:**
  1. Menghilangkan seluruh operasi mutasi (`INSERT`, `UPDATE`, `DELETE`) dari alur `getBookingQrToken()`.
  2. Implementasi HMAC deterministik berbasis `QR_TOKEN_SECRET` untuk pemesanan baru sehingga payload dan hash identik antara waktu pembuatan dan pembacaan.
  3. Implementasi fallback penelusuran payload asli dari `idempotency_records` untuk booking eksisting (`BKG-20261128-3465`) dengan verifikasi pencocokan SHA-256 terhadap `token_hash`.
  4. Penambahan 8 skenario regression tests pada `tests/be4/qr-token-read-only.test.ts` (163/163 BE PASS, 208/208 FE PASS).
  5. Pengujian live API dan UI browser berhasil menampilkan QR tanpa mengubah database.

---

### DEF-005A: Preview Kamera QR Hitam pada Halaman `/staff/scan`
- **Defect ID:** `DEF-005A`
- **Test Case Terkait:** `UAT-STF-03`
- **Role Pengguna:** STAFF
- **Halaman / URL:** `/staff/scan`
- **Severity:** 🟠 High
- **Priority:** P1
- **Status:** **CLOSED**
- **Pelapor:** UAT Tester
- **Tanggal Ditemukan:** 2026-11-27
- **Lingkungan UAT:** Chrome / Chromium, Next.js Production Build, Supabase `PINJAM_TESTING`
- **Langkah Reproduksi (Steps to Reproduce):**
  1. Login menggunakan akun Staff `conc-staff@example.test`.
  2. Buka halaman scanner `/staff/scan`.
  3. Klik tombol *"Aktifkan Kamera QR"*.
  4. Amati kotak pratinjau video di layar.
- **Hasil yang Diharapkan (Expected Result):**
  - Kotak pratinjau video langsung menampilkan aliran video langsung dari kamera/webcam.
  - Video memulai pemutaran (`play()`) tanpa layar hitam.
  - Jika izin ditolak atau perangkat tidak ada, pesan error informatif muncul dan input manual tetap tersedia.
- **Hasil Aktual Sebelum Perbaikan (Actual Result):**
  - Izin kamera diberikan, namun area pratinjau kamera tetap berwarna hitam legam.
  - Terjadi race condition React ref lifecycle karena elemen `<video>` berada dalam blok `{cameraActive && ...}`, sehingga `videoRef.current` masih `null` saat dievaluasi sinkron pada tick yang sama.
- **Tangkapan Layar Bukti:** `uat-stf-05a-scan-view.png`
- **Resolusi / Tindakan Perbaikan:**
  1. Menggunakan binding ref ganda: ref callback saat elemen `<video>` terpasang di DOM (`ref={(el) => { ... }}`) dan hook `useEffect([cameraActive])`.
  2. Mengganti constraint kamera kaku `{ facingMode: "environment" }` menjadi adaptif `{ video: { facingMode: { ideal: "environment" } } }`.
  3. Menambahkan penanganan spesifik untuk error kamera: `PermissionDeniedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`.
  4. Menambahkan graceful handling ketiadaan `window.BarcodeDetector` yang menghentikan stream dan menyarankan input manual.
  5. Menghentikan stream kamera secara otomatis saat tombol *"Matikan Kamera"* diklik, tab aksi berganti, atau komponen unmount.
  6. Menambahkan unit regression test frontend (211/211 PASS) dan verifikasi visual headless Chrome browser (`uat-stf-05a-scan-view.png`).

---

### DEF-005B: Catatan Maintenance Gagal Memuat (UNKNOWN_ERROR / 404 pada `/api/v1/staff/maintenance`)
- **Defect ID:** `DEF-005B`
- **Test Case Terkait:** `UAT-STF-11`
- **Role Pengguna:** STAFF
- **Halaman / URL:** `/staff/maintenance`
- **Severity:** 🟠 High
- **Priority:** P1
- **Status:** **CLOSED**
- **Pelapor:** UAT Tester
- **Tanggal Ditemukan:** 2026-11-27
- **Lingkungan UAT:** Chrome / Chromium, Next.js Production Build, Supabase `PINJAM_TESTING`
- **Langkah Reproduksi (Steps to Reproduce):**
  1. Login sebagai Staff `conc-staff@example.test`.
  2. Buka menu *"Maintenance & Unit"* (`/staff/maintenance`).
  3. Amati bagian kartu catatan pemeliharaan.
- **Hasil yang Diharapkan (Expected Result):**
  - Daftar catatan pemeliharaan proyektor berhasil dimuat dari database dengan status `IN_PROGRESS` atau `COMPLETED`.
  - Staf dapat memfilter catatan pemeliharaan dan melihat katalog status unit proyektor.
- **Hasil Aktual Sebelum Perbaikan (Actual Result):**
  - Halaman menampilkan kartu error merah: *"Gagal Memuat Catatan Maintenance"* dengan Error Code `UNKNOWN_ERROR`.
  - Panggilan API `GET /api/v1/staff/maintenance` mengembalikan HTTP 404 karena route handler backend belum tersedia.
- **Tangkapan Layar Bukti:** `uat-stf-05b-maintenance-view.png`
- **Resolusi / Tindakan Perbaikan:**
  1. Membuat service `src/lib/maintenance/maintenance-service.ts` dengan repository pattern dan otorisasi ketat `requireStaffOrAdmin()`.
  2. Membuat route handler:
     - `GET /api/v1/staff/maintenance` (daftar maintenance berpaginasi dan filter status).
     - `POST /api/v1/staff/projectors/[projectorId]/maintenance` (mulai maintenance, validasi alasan >= 5 karakter, orkestrasi sekuensial update proyektor dan insert maintenance record dengan mekanisme compensating rollback, audit log).
     - `POST /api/v1/staff/maintenance/[maintenanceId]/complete` (selesaikan maintenance, validasi catatan resolusi, update proyektor ke AVAILABLE jika bebas pinjaman, audit log).
  3. Memastikan integritas terhadap trigger PostgreSQL `verify_maintenance_against_projector()` dan constraint `chk_maintenance_records_status_consistency`.
  4. Menambahkan 6 unit regression test backend pada `tests/be5/maintenance.test.ts` (175/175 BE PASS).
  5. Pengujian live integrasi HTTP (`kaflptksvqwcurzacifs.supabase.co`): 401 unauthenticated, 403 komting, 200 staff (3 data aktual termuat), 422 validasi.
  6. Verifikasi visual peramban Chrome headless (`uat-stf-05b-maintenance-view.png`) mengonfirmasi kartu maintenance termuat bersih tanpa error.

---

## 4. Catatan Kesenjangan Spesifikasi & Gap yang Ditemukan (Pre-Recorded Gaps)

Berhubung audit komparatif mendalam antara `PRD_PINJAM_FINAL.md`, spesifikasi frontend, dan implementasi backend aktual pada branch `feat/fullstack-integration`, berikut adalah catatan kesenjangan fungsional dan arsitektural:

---

### GAP-01: Modul Koreksi Transaksi Administratif Masih Berstatus Placeholder
- **Gap ID:** `GAP-01`
- **Klasifikasi:** *Specification Open Decision / Future Scope*
- **Referensi PRD:** PRD §7.15 (*Koreksi Transaksi oleh Admin*) & `API_CONTRACT_PINJAM.md §13.3` (Open Decision §20).
- **Kondisi Implementasi Aktual:**
  - Halaman antarmuka frontend `/admin/corrections` telah tersedia, namun sengaja menampilkan kartu alert berstatus: *"Koreksi Transaksi (Menunggu Finalisasi Kontrak §13.3 & Open Decision §20: Daftar field resmi yang diizinkan untuk dikoreksi belum difinalisasi)"*.
  - Backend API route `POST /api/v1/admin/transactions/:id/corrections` belum diaktifkan pada sprint BE-1 s/d BE-6 guna melindungi integritas aturan *append-only* mutasi database.
- **Rekomendasi UAT:**
  - Tetap verifikasi bahwa halaman `/admin/corrections` dapat diakses admin dengan status HTTP 200 dan menampilkan alert penjelasan yang benar (`UAT-ADM-15`).
  - Jangan menguji form submit mutasi koreksi historis karena fiturnya memang ditangguhkan (*deferred*).

---

### GAP-02: Endpoint Master Maintenance Staff (Telah Diimplementasikan via DEF-005B)
- **Gap ID:** `GAP-02`
- **Klasifikasi:** *Architectural Realization* (Status: ✅ **RESOLVED / IMPLEMENTED**)
- **Referensi PRD:** PRD §7.13 & §10 (FR-019: *Staff & Admin mengelola maintenance*).
- **Kondisi Implementasi Aktual:**
  - Telah diimplementasikan penuh pada sprint perbaikan DEF-005B melalui endpoint `GET /api/v1/staff/maintenance`, `POST /api/v1/staff/projectors/:projectorId/maintenance`, dan `POST /api/v1/staff/maintenance/:maintenanceId/complete`.
  - Fitur pemantauan, mulai perbaikan, dan penyelesaian perbaikan terintegrasi penuh antara frontend `src/features/staff/staff-maintenance-view.tsx` dan basis data live Supabase.

---

### GAP-03: Job Pembatalan Otomatis Lintas Hari Pukul 00.00 Memerlukan External Cron
- **Gap ID:** `GAP-03`
- **Klasifikasi:** *Operational Infrastructure Dependency*
- **Referensi PRD:** PRD §7.6 & §10 (FR-021: *Membatalkan booking lintas hari pukul 00.00 jika unit belum tersedia*).
- **Kondisi Implementasi Aktual:**
  - Aturan bisnis ketersediaan saat ini ditegakkan secara real-time pada saat booking dibuat (memeriksa status fisik aktual proyektor).
  - Background worker otomatis yang terjadwal persis pukul 00:00 WIB untuk menyapu dan membatalkan booking lintas hari yang proyektornya belum dikembalikan (*overdue*) belum memiliki scheduler runtime internal mandiri di dalam repositori Next.js; repositori baru menyediakan worker outbox `/api/v1/cron/email-outbox`.
- **Rekomendasi UAT:**
  - Untuk lingkungan produksi, buat scheduler cron eksternal (misal Vercel Cron atau GitHub Actions Scheduled Workflow) yang memanggil RPC pembatalan otomatis secara berkala.

---

### GAP-04: Master Data Kelas & Periode Akademik Dikelola Sebagai Atribut Penugasan
- **Gap ID:** `GAP-04`
- **Klasifikasi:** *Data Modeling Simplification*
- **Referensi PRD:** PRD §4 & §7.1 (*Pengelolaan kelas dan periode akademik*).
- **Kondisi Implementasi Aktual:**
  - Dalam skema database `002_user_and_komting_tables.sql`, entitas `class_name` disimpan sebagai kolom teks pada tabel `komting_applications` dan `komting_assignments`.
  - Sistem menegakkan aturan *1 komting aktif per kelas* melalui indeks unik kondisional `uq_komting_assignments_active_class`.
  - Belum tersedia menu atau endpoint master CRUD mandiri `/admin/classes` untuk membuat daftar kelas sebelum pendaftaran dibuka. Kelas tercipta secara dinamis saat mahasiswa mengajukan pendaftaran.
- **Rekomendasi UAT:**
  - Pengujian keunikan kelas diuji melalui pengajuan pendaftaran dan penugasan Komting (`UAT-KMT-01`, `UAT-ADM-04`, dan `UAT-ADM-06`).

---

### GAP-05: Pengiriman Email Nyata Memerlukan Kredensial Produksi Eksternal
- **Gap ID:** `GAP-05`
- **Klasifikasi:** *Environment Configuration*
- **Referensi PRD:** PRD §7.10, §7.11, §7.12 & FR-022 (*Notifikasi Email Transaksional*).
- **Kondisi Implementasi Aktual:**
  - Seluruh mekanisme persistensi outbox, claiming batch atomik (`FOR UPDATE SKIP LOCKED`), deduplikasi, dan transisi status `PENDING` -> `PROCESSING` -> `SENT` telah beroperasi 100% pada tabel `email_outbox`.
  - Pada lingkungan pengembangan dan staging saat ini, provider email yang aktif adalah `console-provider` / `mock-provider` untuk menghindari pengiriman email sampah (*spam*) ke alamat email uji coba.
  - Pengiriman fisik ke inbox penerima nyata (Gmail/kampus) membutuhkan pengisian `RESEND_API_KEY` dan `EMAIL_PROVIDER=resend` pada environment produksi.
- **Rekomendasi UAT:**
  - Keberhasilan pengiriman notifikasi pada UAT diverifikasi melalui pengecekan baris record di tabel `email_outbox` dan respons worker `/api/v1/cron/email-outbox` (`UAT-SEC-06`).

---

## 5. Ringkasan Kesiapan Eksekusi UAT

```
========================================================================================
STATUS KESIAPAN UAT SISTEM PINJAM
========================================================================================
Total Skenario UAT yang Dirancang    : 48 Test Cases
Status Eksekusi Saat Ini             : 🟡 IN PROGRESS (Tahap UAT Komting & Staff)
Total Defect Dilaporkan & Diperbaiki : 6 Defect (DEF-001, DEF-002, DEF-003, DEF-004, DEF-005A, DEF-005B — Seluruhnya CLOSED)
Total Kesenjangan / Gap Terdata      : 4 Gap Arsitektural / Spesifikasi (GAP-02 Resolved)
Kesiapan Lingkungan Staging          : ✅ SIAP (Supabase PINJAM_TESTING & Next.js Production Daemon)
========================================================================================
```

Dokumen ini menjadi rujukan utama pencatatan selama pengujian penerimaan pengguna berlangsung.
