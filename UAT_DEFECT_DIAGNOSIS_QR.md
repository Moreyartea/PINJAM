# Laporan Diagnosis Cacat UAT: QR Booking Gagal Ditampilkan

**Tanggal:** 27 November 2026  
**Branch:** `feat/fullstack-integration`  
**Target Environment:** Supabase Live `PINJAM_TESTING` & Next.js Local Server  
**Data Transaksi Terkait:**
- **Booking Code:** `BKG-20261128-3465`
- **Booking ID:** `f28f49c3-be76-4f85-be83-eaa8777d104c`
- **Proyektor:** `PRJ-CONC-001` (`id: 24c97f6b-fb6a-4c2f-8ea5-9bc5c31b2e1f`)
- **Tanggal & Waktu:** 28 November 2026, 09.00–11.00 WIB
- **Status Booking:** `CONFIRMED`
- **Gejala Masalah:** Pada halaman detail booking (`/komting/bookings/:id`), kartu QR menampilkan pesan error:
  `Gagal memuat QR code: qr_tokens.token_hash is immutable`
- **HTTP Response:** `500 Internal Server Error` dari `GET /api/v1/komting/bookings/f28f49c3-be76-4f85-be83-eaa8777d104c/qr`
- **Error Code:** `DATABASE_ERROR`
- **Status Investigasi:** **ROOT CAUSE IDENTIFIED**

---

## 1. Ringkasan Eksekutif Temuan

Pemeriksaan menyeluruh (*end-to-end tracing*) telah dilakukan tanpa mengubah data transaksi `BKG-20261128-3465`, tanpa mengubah database migration, dan tanpa menurunkan aturan keamanan.

**Kesimpulan Utama Diagnosis:**
1. Record booking `BKG-20261128-3465` dan record QR token di tabel `public.qr_tokens` **telah berhasil dibuat secara sempurna** di database saat transaksi pertama kali dikonfirmasi.
2. Error `qr_tokens.token_hash is immutable` **TIDAK** berasal dari proses `INSERT` saat pembuatan booking, melainkan berasal dari proses **`UPDATE` yang tidak semestinya dijalankan saat pembacaan QR token** (`GET /api/v1/komting/bookings/:bookingId/qr`).
3. Di dalam implementasi `getBookingQrToken()` (`src/lib/bookings/booking-service.ts`), setiap kali halaman detail booking dibuka atau di-*refresh*, backend secara keliru membangkitkan string token acak baru (`generateOpaqueQrPayload()`), menghitung hash barunya, dan mencoba melakukan query `UPDATE public.qr_tokens SET token_hash = ...`.
4. Trigger integritas PostgreSQL `guard_qr_token_lifecycle()` yang dipasang pada Migration 008, 009, dan 010 secara tegas menolak perubahan kolom `token_hash` (`IF OLD.token_hash IS DISTINCT FROM NEW.token_hash THEN RAISE EXCEPTION 'qr_tokens.token_hash is immutable'`). Akibatnya, query UPDATE digagalkan oleh database dan memicu HTTP 500 ke frontend.

---

## 2. Hasil Pemeriksaan 7 Tugas Diagnosis

### 2.1 Alur Penerbitan QR Token Setelah Booking Dibuat
1. Komting mengirim form pemesanan ke `POST /api/v1/bookings`.
2. Service `createBooking` (`src/lib/bookings/booking-service.ts` baris 748–771):
   - Menghasilkan token string acak opaque: `const qrPayload = generateOpaqueQrPayload();` (contoh: `pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM`).
   - Menghitung nilai hash SHA-256: `const tokenHash = hashQrPayload(qrPayload);`.
   - Memanggil RPC atomik PostgreSQL `rpc_komting_create_booking`.
3. Di dalam PostgreSQL (Migration 014 baris 174–186):
   - Record booking dibuat di `public.bookings` dengan status `CONFIRMED`.
   - Record QR dibuat di `public.qr_tokens` dengan:
     `booking_id = v_booking.id`, `token_hash = p_qr_token_hash`, `scope = 'PICKUP_AND_RETURN'`, `expires_at = p_qr_expires_at`.
4. Response `POST /api/v1/bookings` mengembalikan data booking beserta `qr_payload` mentah kepada frontend, dan dicatat pada tabel `public.idempotency_records`.
5. Frontend (`NewBookingForm`) melakukan navigasi ke `/komting/bookings/${bookingId}`.

### 2.2 Komponen Frontend & API Service yang Dipanggil
1. Halaman memuat komponen `BookingDetailView` (`src/features/bookings/booking-detail-view.tsx`).
2. Baris 71–82:
   ```ts
   const shouldFetchQr = booking?.status === "CONFIRMED";
   const { data: qrData, loading: qrLoading, error: qrError } = useAsyncQuery<{ qr_payload: string; expires_at: string }>(
     async () => {
       const res = await services.qr.getBookingQr(bookingId);
       return res.data;
     },
     [bookingId, booking?.status],
     { enabled: Boolean(shouldFetchQr) }
   );
   ```
3. `services.qr.getBookingQr` (`src/services/api/api-services.ts` baris 168) memanggil endpoint:
   `GET /api/v1/komting/bookings/${bookingId}/qr`.
4. Nilai `qrData.qr_payload` diteruskan ke komponen kartu `<BookingQrCard>` (`src/components/qr/booking-qr-card.tsx`). Karena endpoint mengembalikan error 500, kartu menampilkan status error:
   `Gagal memuat QR code: qr_tokens.token_hash is immutable`.

### 2.3 Backend QR Route, Token Service, & Query Database
1. Route handler `src/app/api/v1/komting/bookings/[bookingId]/qr/route.ts` menerima request GET:
   - Memverifikasi otentikasi KOMTING aktif via `requireActiveKomting(request)`.
   - Memanggil `getBookingQrToken(context, bookingId)`.
2. Service `getBookingQrToken` (`src/lib/bookings/booking-service.ts` baris 1036–1060):
   ```ts
   const qrRepo = deps.qrRepository ?? createSupabaseQrRepository();
   const qr = await qrRepo.findTokenByBookingId(bookingId);
   ...
   // Generate payload
   const qrPayload = generateOpaqueQrPayload();
   const tokenHash = hashQrPayload(qrPayload);
   const expiresAt = booking.pickup_window_end_at;

   if (qr && qrRepo.updateTokenForBooking) {
     await qrRepo.updateTokenForBooking({ bookingId, tokenHash, expiresAt });
   } else {
     await qrRepo.createTokenForBooking({ bookingId, tokenHash, expiresAt });
   }
   ```
3. `qrRepo.updateTokenForBooking` (`src/lib/qr/qr-service.ts` baris 98–111) mengeksekusi query database via Supabase Admin Client:
   ```ts
   const { error } = await admin
     .from("qr_tokens")
     .update({ token_hash: tokenHash, expires_at: expiresAt })
     .eq("booking_id", bookingId);
   ```
4. Query inilah yang mengirim `UPDATE public.qr_tokens SET token_hash = $1...` ke PostgreSQL.

### 2.4 Migration Database (001–017) & Trigger Immutability
1. **Migration 004** (`20261126000004_booking_loan_inspection_maintenance_qr_tables.sql` baris 308–328):
   - Membuat tabel `public.qr_tokens` dengan kolom `token_hash TEXT NOT NULL UNIQUE`.
2. **Migration 008, 009, dan 010** (`20261126000010_fix_sql_trigger_and_qr_clock.sql` baris 291–307):
   - Menerapkan fungsi trigger `public.guard_qr_token_lifecycle()` pada event `BEFORE UPDATE ON public.qr_tokens`.
   - Menetapkan aturan immutabilitas kriptografis:
     ```sql
     IF OLD.booking_id IS DISTINCT FROM NEW.booking_id THEN
       RAISE EXCEPTION 'qr_tokens.booking_id is immutable'
         USING ERRCODE = '23514';
     END IF;

     IF OLD.token_hash IS DISTINCT FROM NEW.token_hash THEN
       RAISE EXCEPTION 'qr_tokens.token_hash is immutable'
         USING ERRCODE = '23514';
     END IF;
     ```
   - Trigger ini dirancang secara sengaja agar sebuah QR token yang telah diterbitkan tidak dapat diubah-ubah secara sembarangan (*anti-tamper* dan *anti-replay*).

### 2.5 Operasi Database yang Mencoba Mengubah `token_hash`
- **Operasi:** `UPDATE public.qr_tokens SET token_hash = <new_token_hash>, expires_at = <expires_at> WHERE booking_id = <booking_id>`
- **Pelaku Pemanggilan:** `qrRepo.updateTokenForBooking()` di `src/lib/qr/qr-service.ts` baris 101, yang dipanggil oleh `getBookingQrToken()` di `src/lib/bookings/booking-service.ts` baris 1053.
- **Kondisi Pelanggaran:** Nilai `<new_token_hash>` dibangkitkan secara acak pada setiap request GET, sehingga selalu berbeda dengan `<old_token_hash>` yang tersimpan di baris tabel.

### 2.6 Status Kesiapan QR Token Aktual pada `BKG-20261128-3465`
Pemeriksaan read-only langsung pada basis data `PINJAM_TESTING` membuktikan bahwa data booking dan token QR sebenarnya **sudah tersimpan lengkap dan valid**:

1. **Tabel `public.bookings`:**
   ```json
   {
     "id": "f28f49c3-be76-4f85-be83-eaa8777d104c",
     "booking_code": "BKG-20261128-3465",
     "status": "CONFIRMED",
     "komting_id": "ffdeb199-48be-470c-8cfc-6890ecd96dfd",
     "projector_id": "24c97f6b-fb6a-4c2f-8ea5-9bc5c31b2e1f",
     "booking_date": "2026-11-28",
     "start_time": "09:00:00",
     "estimated_return_at": "2026-11-28T04:00:00+00:00",
     "pickup_window_start_at": "2026-11-28T01:30:00+00:00",
     "pickup_window_end_at": "2026-11-28T02:15:00+00:00",
     "created_at": "2026-11-27T09:03:09.143319+00:00"
   }
   ```
2. **Tabel `public.qr_tokens`:**
   ```json
   {
     "id": "1e07834f-6fbb-4609-ab65-ff3e6d591976",
     "booking_id": "f28f49c3-be76-4f85-be83-eaa8777d104c",
     "loan_id": null,
     "token_hash": "51ccac727ebf63424e885d4fbcf044dbd6ddae88713a7ef6cdcd090357506f23",
     "scope": "PICKUP_AND_RETURN",
     "expires_at": "2026-11-28T02:15:00+00:00",
     "pickup_used_at": null,
     "return_used_at": null,
     "revoked_at": null,
     "created_at": "2026-11-27T09:03:09.143319+00:00",
     "updated_at": "2026-11-27T09:03:09.143319+00:00"
   }
   ```
3. **Tabel `public.idempotency_records`:**
   Mencatat respon pembuatan booking asli beserta `qr_payload`:
   - `qr_payload`: `"pjmqr_v1_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM"`
   - Perhitungan verifikasi SHA-256:
     $$\text{SHA-256}(\text{"pjmqr\_v1\_aPyXOV8FkZr3lkePpgmo8E5moVTC9qbM"}) = \text{51ccac727ebf63424e885d4fbcf044dbd6ddae88713a7ef6cdcd090357506f23}$$
   - **Hasil:** Hash cocok 100% dengan baris di tabel `qr_tokens`.

### 2.7 Sumber Kesalahan: INSERT, UPDATE, Upsert, atau Pembacaan?
- **Sumber Kesalahan:** Terjadi pada operasi **UPDATE** yang secara keliru ditempatkan di dalam alur **pembacaan token (GET)**.
- Operasi pembuatan token awal (`INSERT` via RPC `rpc_komting_create_booking`) berjalan sukses tanpa pelanggaran.
- Namun, saat endpoint pembacaan `GET /api/v1/komting/bookings/:bookingId/qr` dipanggil, service mencoba melakukan `UPDATE` pada `token_hash` yang seharusnya tidak pernah disentuh.

---

## 3. Akar Masalah Arsitektural

1. **Ketidaksesuaian Antara Mock Unit Test dan Real Database:**
   - Pada unit test backend (`tests/be4/booking-and-loan.test.ts` baris 664–668), `state.qrRepo.updateTokenForBooking` disimulasikan sebagai mutasi objek JavaScript dalam array in-memory (`t.token_hash = tokenHash;`), sehingga tidak ada trigger database yang memvalidasi immutabilitas.
   - Di PostgreSQL Supabase, trigger `guard_qr_token_lifecycle()` memblokir mutasi ini secara ketat.

2. **Ketiadaan Mekanisme Rekonstruksi/Penyimpanan Token Mentah yang Idempotent:**
   - Database hanya menyimpan `token_hash` (demi perlindungan zero-knowledge dari kebocoran dump database).
   - Namun, karena fungsi pembangkit awal menggunakan `crypto.randomBytes(24)`, string `qr_payload` mentah tidak dapat didekripsi balik dari `token_hash`.
   - Pengembang sebelumnya mencoba menyiasati hal ini dengan menghasilkan token acak baru pada setiap request GET dan menimpanya ke database, yang mana secara fundamental melanggar aturan immutabilitas database dan melanggar prinsip PRD bahwa QR yang sama harus dapat digunakan untuk pickup, dibagikan ke perwakilan kelas, dan digunakan kembali untuk return.

---

## 4. Rekomendasi Solusi Sebelum Implementasi

Untuk mengatasi masalah ini secara permanen tanpa melanggar ketentuan (tanpa mengubah migration 001–017 dan tanpa menonaktifkan trigger), diajukan rekomendasi arsitektur perbaikan berikut:

### Rekomendasi A (Paling Kuat & Standar Industri — Deterministic Secret Derivation / HMAC):
1. **Derivasi Token Deterministik:**
   Gunakan HMAC-SHA256 untuk menghasilkan `qr_payload` dari kombinasi data booking yang immutable (`booking.id` + `booking.created_at`) menggunakan server-only secret (`process.env.SUPABASE_SERVICE_ROLE_KEY`):
   $$\text{qr\_payload} = \text{"pjmqr\_v1\_"} + \text{Base64Url}(\text{HMAC-SHA256}(booking\_id \parallel created\_at, \text{SECRET}))$$
   $$\text{token\_hash} = \text{SHA-256}(\text{qr\_payload})$$
2. **Kelebihan:**
   - Saat pembuatan booking (`POST /api/v1/bookings`): `qr_payload` dan `token_hash` dihitung dengan rumus ini dan disimpan sekali ke `qr_tokens`.
   - Saat pembacaan token (`GET /api/v1/komting/bookings/:id/qr`): `qr_payload` dihitung ulang menggunakan rumus yang sama persis.
   - **Hasil:** `token_hash` dari payload yang dihitung selalu identik dengan `token_hash` yang sudah ada di database.
   - **TIDAK PERLU QUERY `UPDATE` SAMA SEKALI** pada `getBookingQrToken()`. Endpoint menjadi murni *READ-ONLY* idempotent.
   - QR stabil, konsisten setelah refresh, dapat di-screenshot atau dibagikan ke wakil, dan dapat digunakan untuk return tanpa takut hangus.

### Dukungan untuk Transaksi Berjalan (Termasuk `BKG-20261128-3465`):
- Untuk transaksi yang sudah ada di database sebelum perbaikan (seperti `BKG-20261128-3465`), tambahkan mekanisme pencarian fallback:
  Jika derivasi deterministik tidak cocok dengan `qr.token_hash` lama, periksa apakah `qr_payload` tersimpan pada `idempotency_records` untuk booking tersebut. Jika ada (dan pada `BKG-20261128-3465` terbukti ada), kembalikan payload tersebut!
- Dengan kombinasi ini, baik booking lama (`BKG-20261128-3465`) maupun booking-booking baru akan dapat menampilkan QR dengan lancar tanpa error database.

---

*Laporan ini disusun sebagai hasil diagnosis mendalam. Perubahan kode atau mutasi database belum dilakukan dan menunggu persetujuan pengguna sesuai ketentuan.*
