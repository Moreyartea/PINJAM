# LAPORAN PENYELESAIAN DEFECT UAT: DEF-003
# PERBAIKAN QR BOOKING READ-ONLY & PENCEGAHAN PELANGGARAN IMMUTABLE TOKEN HASH
# PINJAM — Sistem Peminjaman Proyektor

**Dokumen ID:** `UAT-DEF-003-REPORT`  
**Versi:** 1.0.0  
**Tanggal:** 27 November 2026  
**Status Defect:** **CLOSED / VERIFIED**  
**Branch:** `feat/fullstack-integration`  
**Target Environment:** Supabase Live `PINJAM_TESTING` & Next.js Production Build (`localhost:3000`)

---

## 1. Ringkasan Eksekutif

Setelah transaksi booking berhasil dibuat pada sesi UAT dengan kode booking `BKG-20261128-3465` (ID: `f28f49c3-be76-4f85-be83-eaa8777d104c`), penguji membuka halaman rincian booking (`/komting/bookings/:id`) untuk memeriksa tiket QR pengambilan. Namun, komponen QR gagal ditampilkan dengan pesan error database:

```
qr_tokens.token_hash is immutable
```

Berdasarkan investigasi mendalam, akar masalah telah ditemukan, dianalisis, dan diperbaiki secara menyeluruh dengan strategi **100% Read-Only QR Retrieval** yang mempertahankan integritas trigger immutability PostgreSQL tanpa mengubah satupun file migration (001–017).

Seluruh kriteria penerimaan telah diverifikasi secara sukses:
1. **Zero Database Mutation**: Endpoint `GET /api/v1/komting/bookings/:id/qr` murni *read-only* tanpa memanggil `UPDATE`, `INSERT`, atau `DELETE`.
2. **Penanganan Booking Eksisting (`BKG-20261128-3465`)**: Payload asli (`pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM`) berhasil dibaca kembali dari cache `idempotency_records`, dicocokkan SHA-256 terhadap `qr_tokens.token_hash`, dan dikembalikan tanpa mutasi basis data.
3. **Penanganan Booking Baru (HMAC Deterministik)**: Menggunakan secret server `QR_TOKEN_SECRET` untuk menurunkan payload QR yang identik dan stabil saat pembuatan dan pembacaan.
4. **Otorisasi Ketat**: Akses QR hanya diizinkan untuk Komting pemilik booking aktif; Komting lain dan Staff ditolak dengan kode `403 Forbidden`, tanpa token ditolak dengan `401 Unauthorized`, dan booking kedaluwarsa/batal ditolak dengan `422 Unprocessable Entity`.
5. **Kualitas & Verifikasi**: 163/163 Backend Unit Tests PASS, 208/208 Frontend Unit Tests PASS, Typecheck 0 error, Lint 0 error, Production Build PASS, Live Supabase API PASS, dan penayangan visual UI browser PASS dengan screenshot terverifikasi.

---

## 2. Diagnosis Akar Masalah (Root Cause Analysis)

Pada skema database PostgreSQL PINJAM (`010_qr_and_audit_triggers.sql`), terdapat trigger pengaman:
```sql
CREATE TRIGGER trg_guard_qr_token_immutable
  BEFORE UPDATE ON qr_tokens
  FOR EACH ROW
  EXECUTE FUNCTION guard_qr_token_lifecycle();
```
Fungsi `guard_qr_token_lifecycle()` menegakkan aturan keamanan bahwa kolom `token_hash` pada tabel `qr_tokens` bersifat **immutable** (tidak boleh diubah setelah dibuat). Hal ini dirancang agar token QR tidak dapat dipalsukan, ditimpa, atau dimanipulasi setelah diterbitkan.

Namun, pada implementasi lama `src/lib/bookings/booking-service.ts` di fungsi `getBookingQrToken()`:
1. Setiap kali halaman detail booking dimuat atau direfresh, sistem membuat string token acak baru via `generateQrToken()`.
2. Sistem kemudian mengeksekusi:
   ```ts
   await qrRepo.updateTokenForBooking(bookingId, newTokenHash, newExpiresAt);
   ```
3. Operasi `UPDATE` ini langsung memicu trigger PostgreSQL dan melempar pengecualian `SQLSTATE 23514: qr_tokens.token_hash is immutable`, menyebabkan HTTP `500 DATABASE_ERROR` pada frontend.

---

## 3. Arsitektur Solusi & Perubahan Implementasi

### 3.1 Strategi Read-Only & Zero Mutation
Fungsi `getBookingQrToken()` dirombak total agar menjadi fungsi pembacaan murni (*read-only*). Seluruh pemanggilan `updateTokenForBooking` dan `createTokenForBooking` pada alur GET dieliminasi.

### 3.2 Penanganan Booking Eksisting (Idempotency Cache Fallback)
Setiap transaksi pembuatan booking pada PINJAM dieksekusi melalui middleware idempotensi `withIdempotency()`. Seluruh respons sukses disimpan ke tabel `idempotency_records` dengan kolom JSONB `response_body`.
- Dibuat method baru pada repository QR: `findCachedPayloadByBookingId(bookingId, komtingId)` yang mencari record pada `idempotency_records` dengan filter JSON `response_body->'data'->>'id' = bookingId`.
- Untuk booking `BKG-20261128-3465`, payload asli `pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM` berhasil ditarik dari record respons pembuatan booking tersebut.
- Sistem memverifikasi kecocokan:
  $$\text{SHA-256}(\text{payload}) == \text{qr\_tokens.token\_hash}$$
  Jika cocok, payload asli langsung dikembalikan ke frontend tanpa mutasi database.

### 3.3 Penanganan Booking Baru (HMAC-SHA256 Deterministik)
Untuk seluruh booking baru yang akan dibuat di masa mendatang, sistem menggunakan HMAC deterministik:
- Payload diturunkan dari parameter tetap booking:
  $$\text{message} = \text{komtingId} : \text{projectorId} : \text{bookingDate} : \text{startTime} : \text{estimatedReturnAt}$$
  $$\text{payload} = \text{"pjmqr\_v1\_"} + \text{HMAC-SHA256}(message, \text{QR\_TOKEN\_SECRET})$$
- Secret `QR_TOKEN_SECRET` dikonfigurasi melalui environment variable server murni dan tidak pernah diekspos ke client.
- Dengan formula deterministik ini:
  1. Pada saat booking dibuat (`createBooking`), payload dan token_hash disimpan ke database.
  2. Pada saat detail booking dibaca (`getBookingQrToken`), fungsi merekonstruksi payload yang persis sama dari parameter booking.
  3. Hash dari payload terbukti cocok 100% dengan `token_hash` yang tersimpan, tanpa perlu ada pembaruan basis data sama sekali.

### 3.4 Ringkasan File yang Dimodifikasi

| File | Perubahan |
|---|---|
| `src/lib/config/server-env.ts` | Menambahkan helper aman `getQrTokenSecret()` dengan validasi minimal panjang dan fallback terkendali di server. |
| `.env.example` & `.env.local` | Menambahkan konfigurasi `QR_TOKEN_SECRET` server-only. |
| `src/lib/qr/qr-service.ts` | 1. Implementasi `generateDeterministicQrPayload(params, secretOverride)`.<br>2. Menambahkan `findCachedPayloadByBookingId()` pada `QrTokenRepository` dan `createSupabaseQrRepository()`. |
| `src/lib/bookings/booking-service.ts` | 1. `createBooking()` menggunakan pembuatan payload deterministik.<br>2. `getBookingQrToken()` menjadi 100% read-only dengan validasi kepemilikan, pengecekan HMAC, dan fallback cache idempotensi. |
| `tests/be4/qr-token-read-only.test.ts` | 8 skenario pengujian unit regression baru untuk memverifikasi seluruh kriteria read-only QR. |
| `package.json` | Menambahkan file test baru ke dalam pipeline script `test:be4`. |

---

## 4. Hasil Verifikasi & Pengujian Komprehensif

### 4.1 Unit Regression Testing Suite
Pengujian unit backend dan frontend dijalankan dan lulus 100%:

```
$ npm run test:unit:be
Test Suites: 7 passed, 7 total
Tests:       163 passed, 163 total
Snapshots:   0 total
Time:        3.421 s
(Termasuk BE-4: 41/41 PASS dengan 8 skenario khusus qr-token-read-only.test.ts)

$ npm run test:unit:fe
Test Suites: 32 passed, 32 total
Tests:       208 passed, 208 total
Snapshots:   0 total
Time:        4.512 s
```

#### Rincian 8 Skenario Regression Test (`tests/be4/qr-token-read-only.test.ts`):
1. ✅ **GET QR Berhasil**: Mengembalikan payload QR valid untuk booking milik Komting terautentikasi.
2. ✅ **Idempotensi Pembacaan**: Panggilan GET berulang menghasilkan payload QR yang identik dan stabil.
3. ✅ **Zero Database Mutation**: Memverifikasi secara tegas bahwa `updateTokenForBooking` dan `createTokenForBooking` dipanggil sebanyak **0 kali**.
4. ✅ **Old Booking Fallback**: Berhasil membaca payload dari cache `idempotency_records` untuk booking `BKG-20261128-3465`.
5. ✅ **Integritas Kriptografi**: SHA-256 dari payload yang dikembalikan selalu cocok dengan `token_hash` di database.
6. ✅ **Isolasi Kepemilikan (403)**: Komting lain yang mencoba mengakses QR ditolak dengan HTTP `403 Forbidden`.
7. ✅ **Role Guard (403)**: Pengguna non-Komting (Staff/Admin) ditolak dengan HTTP `403 Forbidden`.
8. ✅ **Lifecycle Guard (422)**: Booking yang dibatalkan atau token yang kedaluwarsa ditolak dengan HTTP `422 Unprocessable Entity`.

---

### 4.2 Quality Gate (Typecheck, Lint, Production Build)

```
$ npm run typecheck
Found 0 errors.

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Generating static pages (48/48)
✓ Finalizing page optimization
○ (Static)   prerendered as static content
ƒ (Dynamic)  server-rendered on demand
```

---

### 4.3 Verifikasi Live API pada Lingkungan Staging (`PINJAM_TESTING`)

Server Next.js production dijalankan secara lokal pada `http://localhost:3000`. Pengujian langsung dilakukan terhadap transaksi riil `BKG-20261128-3465`:

1. **Pemanggilan Pertama (Authenticated KOMTING):**
   ```
   HTTP/1.1 200 OK
   Content-Type: application/json
   {
     "success": true,
     "data": {
       "payload": "pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM",
       "booking_id": "f28f49c3-be76-4f85-be83-eaa8777d104c",
       "expires_at": "2026-11-28T04:15:00.000Z"
     }
   }
   ```
2. **Pemanggilan Kedua (Refresh / Idempotensi):**
   - Mengembalikan HTTP `200 OK` dengan payload yang persis sama (`pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM`).
3. **Pemeriksaan Mutasi Database:**
   - Rekor `qr_tokens` (ID: `1e07834f-6fbb-4609-ab65-ff3e6d591976`) di Supabase `PINJAM_TESTING` diperiksa.
   - Kolom `updated_at` tercatat tetap `2026-11-27T09:03:09.143319+00:00` (sama persis dengan saat booking pertama dibuat). Terbukti **0 mutasi**.
4. **Keamanan Tanpa Autentikasi:**
   - Pemanggilan tanpa header autentikasi mengembalikan `401 Unauthorized` dengan pesan `UNAUTHORIZED`.

---

### 4.4 Verifikasi Antarmuka Browser (Visual UI)

Pengujian browser headless dijalankan untuk membuka halaman `/komting/bookings/f28f49c3-be76-4f85-be83-eaa8777d104c` menggunakan sesi terautentikasi Komting pemilik booking.

- **Status Komponen**: Kartu QR Code berhasil dirender secara penuh tanpa error alert.
- **Visual QR**: Menampilkan elemen gambar SVG QR Code kontras tinggi dengan label *"Tunjukkan tiket QR ini kepada staf di loket inventaris"*.
- **Data Transaksi**: Kode Booking `BKG-20261128-3465`, Proyektor `PRJ-CONC-001`, Status `CONFIRMED`, Jadwal `28 November 2026, 09:00 - 11:00 WIB`.
- **Tangkapan Layar Bukti**: Disimpan pada artifact `uat-kmt-06-qr-booking-detail.png` di direktori artifact percakapan.

---

## 5. Kepatuhan Terhadap Batasan Proyek

| Batasan | Status Kepatuhan | Keterangan |
|---|:---:|---|
| **Branch `feat/fullstack-integration`** | ✅ PATUH | Seluruh pekerjaan dilakukan di branch yang sama. |
| **Data Booking `BKG-20261128-3465`** | ✅ PATUH | Data booking tetap utuh dengan status `CONFIRMED`, tidak dibatalkan atau dimodifikasi. |
| **Migration 001–017** | ✅ PATUH | Tidak ada satupun file migration yang disentuh atau diubah. |
| **Database Triggers** | ✅ PATUH | Trigger immutability PostgreSQL tetap aktif dan mengawal integritas sistem secara utuh. |
| **Keamanan Supabase Production** | ✅ PATUH | Seluruh pengujian hanya berinteraksi dengan database staging `PINJAM_TESTING`. |
| **Git Commit & Push** | ✅ PATUH | Tidak ada perintah commit atau push yang dijalankan. |

---

## 6. Rekomendasi Langkah UAT Berikutnya

Dengan diselesaikannya `DEF-003`, alur pemesanan dan penayangan tiket QR Komting kini telah beroperasi normal tanpa kendala. Pengujian UAT dapat dilanjutkan ke skenario berikutnya:
1. **`UAT-KMT-11`**: Penayangan Tiket QR Pickup pada Detail Booking (dapat langsung ditandai `PASS` berdasarkan bukti verifikasi visual).
2. **`UAT-STF-05` / `UAT-STF-06`**: Pengujian sisi loket Staff untuk memindai token QR `pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM` guna serah-terima unit proyektor `PRJ-CONC-001` (transisi ke status `LOAN_ACTIVE`).
3. **`UAT-KMT-08` / `UAT-KMT-09`**: Verifikasi penolakan pembuatan booking ganda saat akun Komting telah memiliki booking aktif `BKG-20261128-3465`.
