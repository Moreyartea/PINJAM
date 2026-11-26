# BACKEND SPECIFICATION — PINJAM

**Versi:** 1.0.0  
**Status:** Draft implementasi backend  
**Tanggal:** 26 November 2026  
**Acuan:** `PRD_PINJAM_FINAL.md` dan `API_CONTRACT_PINJAM.md`  
**Pemilik implementasi:** Backend Lead

---

## 1. Tujuan dokumen

Dokumen ini menjadi panduan implementasi backend PINJAM. Dokumen menetapkan tanggung jawab backend, rancangan arsitektur, domain data, aturan integritas, modul layanan, proses transaksi, keamanan, scheduled jobs, email, testing, dan tahapan implementasi.

Backend harus mengikuti:
1. `PRD_PINJAM_FINAL.md` untuk aturan produk dan business rules.
2. `API_CONTRACT_PINJAM.md` untuk endpoint, request, response, status, dan error code.
3. Dokumen ini untuk panduan teknis implementasi backend.

Jika terjadi konflik, PRD menjadi acuan aturan bisnis. API Contract menjadi acuan bentuk komunikasi eksternal selama tidak bertentangan dengan PRD. Perubahan harus dicatat dan disepakati frontend/backend sebelum implementasi.

---

## 2. Prinsip arsitektur

### 2.1 Prinsip utama

- Backend adalah sumber kebenaran seluruh business rules dan status transaksi.
- Semua operasi penting divalidasi di server, bukan hanya di frontend.
- Perubahan beberapa entitas yang saling terkait harus dilakukan secara atomik.
- Gunakan database constraints selain validasi aplikasi untuk menjaga integritas.
- Endpoint mutasi penting harus aman terhadap retry dan double-submit.
- Scheduled jobs harus idempotent dan aman dijalankan ulang.
- Semua timestamp kejadian disimpan konsisten dalam UTC; aturan kalender operasional menggunakan `Asia/Jakarta`.
- File identitas dan bukti return disimpan di private storage.
- Perubahan penting dicatat pada audit log.
- Email tidak boleh menjadi bagian yang dapat menggagalkan transaksi bisnis utama.
- Hindari overengineering; implementasikan kebutuhan PRD secara bertahap.

### 2.2 Rekomendasi stack

Baseline yang direkomendasikan:
- PostgreSQL sebagai database relasional.
- Backend API berbasis TypeScript.
- Next.js Route Handlers/server-side application layer atau backend service terpisah, dipilih saat setup.
- Supabase Auth bila disepakati sebagai provider autentikasi.
- Supabase Storage atau object storage privat untuk file.
- Email provider melalui adapter.
- Scheduler/cron untuk job waktu.
- OpenAPI untuk dokumentasi endpoint.

Pilihan stack final harus dikonfirmasi sebelum Sprint BE-0. Jangan menggabungkan dua pendekatan backend yang berbeda tanpa kebutuhan jelas.

### 2.3 Batas arsitektur

Pisahkan setidaknya:
- API/transport layer.
- Authentication dan authorization.
- Application/use-case layer.
- Domain/business rules.
- Data access/repository layer.
- Database migrations dan constraints.
- Storage adapter.
- Email/outbox worker.
- Scheduled jobs.
- Audit logging.
- Automated tests.

Hindari menaruh seluruh business logic di route handler atau komponen UI.

---

## 3. Domain utama

Backend terdiri dari domain berikut:

1. **Identity & Access** — pengguna, sesi, role, status akun.
2. **Komting Application** — pendaftaran, verifikasi, assignment, replacement, deactivation.
3. **Projector Inventory** — data unit dan status fisik.
4. **Operating Hours** — konfigurasi dan snapshot jam layanan.
5. **Availability & Booking** — pengecekan ketersediaan dan booking.
6. **Loan & QR** — token QR, pickup, loan, return.
7. **Inspection & Maintenance** — pemeriksaan kondisi dan maintenance.
8. **Notification** — email outbox dan status pengiriman.
9. **Audit** — catatan aktivitas dan koreksi.
10. **Background Jobs** — expiry, midnight availability, reminders, overdue, retry email.

Setiap domain harus memiliki tanggung jawab dan batas perubahan data yang jelas.

---

## 4. Rancangan data dan relasi

Nama tabel berikut merupakan rancangan logis. Backend boleh menyesuaikan nama/normalisasi selama invariant dan kontrak API tetap dipenuhi.

### 4.1 `users` / identity provider profile

Kolom logis:
- `id`
- `auth_provider_user_id`
- `email`
- `full_name`
- `role`
- `account_status`
- `created_at`
- `updated_at`

Ketentuan:
- Kredensial autentikasi dikelola provider; jangan menyimpan password plaintext.
- Role dan account status dikelola server.
- Role tidak boleh dapat diubah oleh endpoint profil pengguna.
- Satu identitas autentikasi hanya memiliki satu profil aplikasi.

### 4.2 `komting_applications`

Kolom logis:
- `id`
- `user_id`
- `student_id`
- `class_name`
- `identity_photo_storage_key`
- `application_type` — pengajuan biasa atau replacement
- `status`
- `admin_note`
- `rejection_reason`
- `reviewed_by`
- `reviewed_at`
- `submitted_at`
- `created_at`
- `updated_at`

Ketentuan:
- Foto identitas menyimpan storage key privat, bukan URL publik permanen.
- Riwayat pengajuan dipertahankan.
- Pengajuan ulang oleh mahasiswa yang pernah nonaktif diperbolehkan.
- Cegah pengajuan aktif ganda sesuai aturan produk.

### 4.3 `komting_assignments`

Kolom logis:
- `id`
- `user_id`
- `class_name`
- `status`
- `started_at`
- `ended_at`
- `created_by`
- `ended_by`
- `end_reason`
- `created_at`
- `updated_at`

Invariant:
- Satu kelas hanya boleh memiliki satu assignment aktif.
- Satu mahasiswa hanya boleh memiliki satu assignment aktif.
- Assignment historis tidak dihapus.
- Replacement menonaktifkan assignment lama dan mengaktifkan assignment baru dalam satu transaksi database.

Gunakan partial unique indexes untuk assignment aktif, misalnya secara konseptual:
- unique `class_name` untuk baris dengan `status = ACTIVE`.
- unique `user_id` untuk baris dengan `status = ACTIVE`.

Sintaks migration final harus mengikuti database yang dipilih.

### 4.4 `projectors`

Kolom logis:
- `id`
- `asset_code`
- `name`
- `brand`
- `model`
- `physical_status`
- `is_active`
- `created_at`
- `updated_at`

`physical_status`:
- `AVAILABLE`
- `BORROWED`
- `MAINTENANCE`
- `INACTIVE`

Status fisik tidak boleh dipakai sebagai pengganti status booking atau loan.

### 4.5 `operating_hours`

Kolom logis:
- `id`
- `service_date`
- `timezone`
- `opens_at`
- `closes_at`
- `admin_early_open_at`
- `note`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Simpan konfigurasi per tanggal atau model konfigurasi yang dapat menghasilkan snapshot per tanggal. Booking harus mempertahankan snapshot jam operasional yang berlaku saat dibuat.

### 4.6 `bookings`

Kolom logis:
- `id`
- `booking_code`
- `komting_id`
- `projector_id`
- `booking_date`
- `start_time`
- `estimated_return_at`
- `status`
- `operating_hours_snapshot`
- `pickup_window_start_at`
- `pickup_window_end_at`
- `cancelled_at`
- `cancel_reason`
- `created_at`
- `updated_at`

Status:
- `CONFIRMED`
- `FULFILLED`
- `CANCELLED`
- `EXPIRED`

Invariant:
- Komting tidak boleh memiliki lebih dari satu booking aktif sesuai definisi PRD.
- Komting yang memiliki loan aktif tidak boleh membuat booking baru.
- Booking hanya hari ini atau besok menurut `Asia/Jakarta`.
- Estimasi kembali harus setelah waktu mulai, pada tanggal kalender yang sama, dan di dalam jam operasional.
- Ketersediaan unit divalidasi ulang secara transaksional ketika booking dibuat.
- Definisi booking aktif untuk constraint harus konsisten dengan status lifecycle yang disepakati.

**Catatan penting:** aturan PRD menyatakan satu booking aktif per komting. Backend harus menetapkan definisi status aktif yang eksplisit dan menggunakannya konsisten di validasi, constraint, dan query. Jangan menganggap `FULFILLED` sebagai booking yang masih menunggu pickup; loan aktif adalah penghalang peminjaman berikutnya.

### 4.7 `loans`

Kolom logis:
- `id`
- `booking_id`
- `projector_id`
- `komting_id`
- `status`
- `picked_up_at`
- `pickup_processed_by`
- `pickup_received_by`
- `representative_name`
- `returned_at`
- `return_processed_by`
- `return_received_by`
- `created_at`
- `updated_at`

Status:
- `ACTIVE`
- `RETURNED`

Invariant:
- Satu booking hanya dapat menghasilkan satu loan.
- Satu komting hanya boleh memiliki satu loan aktif.
- Satu unit tidak boleh memiliki lebih dari satu loan aktif.
- Pickup membuat loan dan mengubah status booking/unit dalam satu transaksi.

### 4.8 `return_inspections`

Kolom logis:
- `id`
- `loan_id`
- `projector_condition`
- `accessories_condition`
- `note`
- `evidence_photo_storage_key`
- `unit_disposition`
- `inspected_by`
- `inspected_at`

Ketentuan:
- Foto wajib jika proyektor `DAMAGED` atau aksesori `INCOMPLETE`.
- `unit_disposition` ditentukan STAFF/ADMIN setelah inspeksi.
- Return dan perubahan status unit dilakukan atomik.

### 4.9 `maintenance_records`

Kolom logis:
- `id`
- `projector_id`
- `reason`
- `note`
- `status`
- `created_by`
- `started_at`
- `resolution_note`
- `completed_by`
- `completed_at`

Status maintenance dapat menggunakan `IN_PROGRESS` dan `COMPLETED`, selama lifecycle konsisten dengan API.

### 4.10 `qr_tokens`

Kolom logis:
- `id`
- `booking_id` atau `loan_id` sesuai tahap penggunaan
- `token_hash`
- `purpose` atau scope
- `expires_at`
- `used_at`
- `revoked_at`
- `created_at`

Ketentuan:
- Token mentah tidak disimpan sebagai nilai permanen bila hash dapat digunakan untuk validasi.
- Token harus cryptographically random dan sulit ditebak.
- Token tidak berisi PII.
- Validasi dan pemakaian token harus mencegah replay/aksi ganda.
- Kebijakan satu token untuk pickup dan return harus dirancang hati-hati: token yang sama harus dapat digunakan sesuai lifecycle, tetapi tidak boleh memungkinkan replay aksi yang telah selesai.

### 4.11 `email_outbox`

Kolom logis:
- `id`
- `event_type`
- `recipient`
- `payload`
- `deduplication_key`
- `status`
- `attempt_count`
- `next_attempt_at`
- `sent_at`
- `last_error`
- `created_at`
- `updated_at`

Status contoh:
- `PENDING`
- `PROCESSING`
- `SENT`
- `FAILED`

Gunakan unique deduplication key untuk mencegah email duplikat untuk event yang sama.

### 4.12 `audit_logs`

Kolom logis:
- `id`
- `actor_user_id`
- `actor_role`
- `action`
- `entity_type`
- `entity_id`
- `before_data`
- `after_data`
- `reason`
- `request_id`
- `created_at`

Audit log bersifat append-only melalui aplikasi. Jangan sediakan endpoint penghapusan audit log.

### 4.13 `idempotency_records`

Kolom logis:
- `id`
- `idempotency_key`
- `actor_user_id`
- `route_or_operation`
- `request_hash`
- `response_status`
- `response_body`
- `created_at`
- `expires_at`

Unique constraint diperlukan untuk scope key yang disepakati. Simpan hasil operasi agar retry mengembalikan hasil konsisten.

---

## 5. Database integrity dan constraints

Validasi aplikasi saja tidak cukup. Tambahkan constraints yang relevan:

- Unique asset code untuk proyektor.
- Unique booking code.
- Unique booking-to-loan relationship.
- Partial unique active assignment per kelas.
- Partial unique active assignment per mahasiswa.
- Partial unique active loan per komting.
- Partial unique active loan per unit.
- Partial unique active booking per komting sesuai definisi status.
- Foreign keys pada seluruh relasi.
- Check constraints untuk enum/status dan rentang nilai bila sesuai.
- Validasi `estimated_return_at` terhadap waktu mulai dan tanggal lokal pada application layer; gunakan constraint tambahan bila dapat diekspresikan dengan aman.
- Unique idempotency key dalam scope actor/operation.
- Unique deduplication key pada outbox.

Jangan mengandalkan unique constraint saja untuk mencegah benturan jadwal lintas tanggal/jam. Gunakan transaction, row locking/advisory locking atau mekanisme database setara sesuai model alokasi yang dipilih.

---

## 6. Authentication dan authorization

### 6.1 Authentication

Provider final perlu diputuskan sebelum implementasi. Jika menggunakan Supabase Auth:
- Verifikasi access token pada server.
- Ambil subject/user ID dari token yang valid.
- Cocokkan dengan profil aplikasi.
- Jangan percaya role dari metadata client yang dapat diubah pengguna.
- Gunakan server-side role/profile sebagai sumber otorisasi.

### 6.2 Authorization middleware/policy

Buat helper/policy terpusat, misalnya:
- `requireAuthenticatedUser`
- `requireActiveKomting`
- `requireRole`
- `requireStaffOrAdmin`
- `requireAdmin`

Setiap endpoint terlindungi harus menerapkan policy. Jangan mengandalkan route frontend atau tombol yang disembunyikan.

### 6.3 Hak akses data

- KOMTING hanya dapat mengakses data booking, loan, dan profil miliknya.
- STAFF mengakses data yang diperlukan untuk operasional.
- ADMIN mengakses fungsi administratif sesuai PRD.
- Foto identitas hanya dapat diakses ADMIN berwenang.
- Foto return dapat diakses role operasional berwenang.
- Semua akses storage privat harus melalui signed URL berumur pendek atau proxy terotorisasi.

### 6.4 Akun nonaktif

Akun KOMTING berstatus `INACTIVE` tidak boleh membuat booking atau menjalankan fungsi komting. Booking yang belum diambil dibatalkan saat deactivation. Loan aktif tetap berjalan sampai return normal.

---

## 7. API layer

Semua endpoint mengikuti `API_CONTRACT_PINJAM.md`.

### 7.1 Response wrapper

Implementasikan response wrapper konsisten:
- `data`
- `meta.request_id`
- `meta.pagination` untuk daftar.

### 7.2 Error handler

Implementasikan satu error mapper:
- Kesalahan autentikasi menjadi `401`.
- Otorisasi menjadi `403`.
- Resource tidak ditemukan menjadi `404`.
- Konflik status/constraint bisnis menjadi `409`.
- Validasi bisnis menjadi `422`.
- Error tak terduga menjadi `500` tanpa membocorkan stack trace.

Setiap error harus memiliki `error.code` stabil dan `request_id` untuk pelacakan.

### 7.3 Request validation

Gunakan schema validation pada batas API. Validasi:
- tipe dan format field,
- enum,
- panjang string,
- tanggal dan waktu,
- ukuran/MIME upload,
- field wajib kondisional,
- role dan ownership.

Validasi API tidak menggantikan database constraints.

### 7.4 OpenAPI

Dokumentasikan endpoint yang telah diimplementasikan. OpenAPI harus mencerminkan:
- path dan method,
- auth/role,
- request schema,
- response schema,
- status code,
- error code,
- multipart upload,
- pagination.

Jika endpoint berubah, update OpenAPI dan `API_CONTRACT_PINJAM.md` dalam perubahan yang sama.

---

## 8. Business logic per domain

### 8.1 Pendaftaran komting

Use case:
- Submit application.
- Get own application status.
- Admin list/detail applications.
- Approve/reject application.
- Approve replacement.
- Deactivate assignment.

Aturan:
- Pengajuan bukan assignment aktif sampai disetujui ADMIN.
- Satu kelas hanya satu komting aktif.
- Satu mahasiswa hanya satu assignment aktif.
- Mantan komting nonaktif dapat mengajukan kembali.
- Penolakan replacement tidak mengubah assignment lama.
- Replacement dilakukan atomik.
- Deactivation membatalkan booking yang belum diambil; loan aktif tidak otomatis ditutup.
- Semua keputusan ADMIN diaudit.

### 8.2 Availability dan booking

Saat membuat booking:
1. Autentikasi pengguna.
2. Pastikan role KOMTING dan assignment aktif.
3. Pastikan account aktif.
4. Pastikan tidak ada booking aktif lain.
5. Pastikan tidak ada loan aktif.
6. Validasi tanggal hari ini/besok berdasarkan `Asia/Jakarta`.
7. Validasi waktu mulai bukan masa lalu.
8. Validasi estimasi kembali setelah waktu mulai.
9. Pastikan estimasi kembali pada tanggal kalender yang sama.
10. Validasi jam operasional dan snapshot.
11. Lock resource/alokasi unit yang relevan.
12. Periksa status fisik dan alokasi pada tanggal booking.
13. Cegah konflik booking pada unit dan rentang waktu.
14. Buat booking `CONFIRMED`.
15. Buat outbox event email dalam transaksi yang sama.
16. Commit dan kembalikan response sesuai API Contract.

Pemeriksaan availability adalah advisory. Kondisi wajib diperiksa ulang ketika booking dibuat.

### 8.3 Booking besok dan validasi tengah malam

- Booking untuk besok dapat dibuat walaupun unit masih `BORROWED` hari ini, karena tanggal kalendernya berbeda.
- Pada pukul 00:00 `Asia/Jakarta` saat tanggal booking dimulai, job memeriksa kondisi fisik unit.
- Jika unit belum `AVAILABLE`, booking yang bergantung pada unit tersebut dibatalkan dan komting diberi email.
- Job harus aman jika berjalan ulang.
- Jangan mengubah status fisik unit hanya karena estimasi pengembalian sebelumnya telah lewat.

### 8.4 Pickup window

Aturan pickup:
- Rentang dasar: 30 menit sebelum waktu mulai sampai 15 menit setelah waktu mulai.
- Batas paling awal adalah waktu yang lebih akhir antara jam layanan yang berlaku dan waktu mulai dikurangi 30 menit.
- Jam operasional standar mulai 08:00; pickup dapat dimulai 07:45 tanpa persetujuan ADMIN.
- Jika ADMIN membuka layanan lebih awal pada 07:00, pickup paling awal 07:30.
- Jika tidak diambil sampai +15 menit dari waktu mulai, booking `EXPIRED`.

Backend harus menghitung dan menyimpan/menyajikan pickup window yang konsisten dengan snapshot jam operasional. Jangan mempercayai perhitungan frontend.

### 8.5 QR validation dan pickup

- QR payload adalah opaque random token.
- QR tidak memuat PII.
- Endpoint validate hanya memeriksa token dan konteks; tidak mengubah transaksi.
- STAFF/ADMIN harus melakukan konfirmasi eksplisit.
- Konfirmasi pickup memvalidasi kembali booking, jendela waktu, unit, assignment, dan token.
- Dalam satu transaksi: booking `FULFILLED`, loan `ACTIVE`, unit `BORROWED`, token/action dicatat, audit dibuat, outbox email dibuat jika diperlukan.
- Cegah pickup ganda melalui lock, constraint, dan idempotency.
- Penerima dapat KOMTING atau REPRESENTATIVE; nama perwakilan disimpan bila relevan.

### 8.6 Return dan inspeksi

- Hanya STAFF/ADMIN yang dapat mengonfirmasi return.
- Validasi loan `ACTIVE` dan token/action.
- Validasi kondisi proyektor dan aksesori.
- Foto wajib jika `DAMAGED` atau `INCOMPLETE`.
- STAFF/ADMIN menentukan disposition `AVAILABLE` atau `MAINTENANCE`.
- Dalam satu transaksi: loan `RETURNED`, inspection dibuat, unit diperbarui, QR/action ditandai, audit dibuat, email outbox dibuat.
- Return lebih awal diperbolehkan.
- Unit baik tersedia kembali segera tanpa buffer.
- Tidak ada denda/sanksi akademik otomatis.
- Kerusakan/aksesori hilang tidak otomatis memblokir komting.

### 8.7 Maintenance

- STAFF/ADMIN dapat memulai maintenance.
- Unit berubah menjadi `MAINTENANCE`.
- Booking yang terdampak dibatalkan dan komting diberi email.
- Unit tidak dapat dibooking selama maintenance.
- Hanya STAFF/ADMIN yang dapat menyatakan unit layak dan mengubahnya menjadi `AVAILABLE`.
- Backend harus memastikan tidak ada loan aktif sebelum unit dinyatakan tersedia.
- Setiap perubahan status dan penyelesaian maintenance diaudit.

### 8.8 Operating hours

- Zona waktu `Asia/Jakarta`.
- ADMIN menentukan jam tutup.
- Perubahan jam operasional memeriksa booking aktif yang terdampak.
- Jika konflik ditemukan, kembalikan `409 OPERATING_HOURS_CONFLICT` dengan detail yang aman.
- Jangan membatalkan booking diam-diam.
- Simpan snapshot per tanggal/booking.
- Perubahan konfigurasi baru tidak mengubah interpretasi booking historis.

### 8.9 Koreksi transaksi

- Hanya ADMIN.
- Alasan wajib.
- Field yang dapat dikoreksi harus berupa allowlist eksplisit.
- Simpan nilai sebelum dan sesudah.
- Validasi ulang invariant setelah koreksi.
- Koreksi tidak boleh menjadi jalan pintas melewati lifecycle.
- Audit log wajib.
- Jika koreksi kompleks dapat merusak konsistensi, sediakan use case koreksi khusus, bukan update bebas.

---

## 9. Transaksi atomik dan locking

Operasi berikut harus atomik:

| Operasi | Perubahan yang harus satu transaksi |
|---|---|
| Approve komting | Application status + assignment aktif + audit + email outbox |
| Replacement | Assignment lama nonaktif + assignment baru aktif + audit + email outbox |
| Deactivation | Assignment nonaktif + pembatalan booking belum pickup + audit + outbox |
| Create booking | Validasi/lock alokasi + booking + audit/outbox bila relevan |
| Pickup | Booking fulfilled + loan active + projector borrowed + token/action + audit/outbox |
| Return | Loan returned + inspection + projector disposition + token/action + audit/outbox |
| Maintenance start | Maintenance record + projector maintenance + pembatalan booking terdampak + audit/outbox |
| Complete maintenance | Maintenance completed + projector available jika valid + audit |

Strategi locking harus mencegah:
- Dua komting membooking unit yang sama pada slot bertabrakan.
- Komting membuat dua booking aktif secara bersamaan.
- Pickup ganda.
- Return ganda.
- Dua loan aktif pada satu unit.
- Dua assignment aktif untuk kelas/mahasiswa yang sama.

Pilih mekanisme sesuai database: row-level locks, advisory locks, exclusion constraints, unique partial indexes, atau kombinasi yang tepat. Dokumentasikan alasan pilihan.

---

## 10. Idempotency

Dukung `Idempotency-Key` pada operasi mutasi kritis sesuai API Contract.

Alur:
1. Terima key dari client.
2. Bentuk hash dari actor, operation, dan payload canonical.
3. Cari record key pada scope yang sesuai.
4. Jika key belum ada, proses operasi dan simpan response dalam transaksi.
5. Jika key sama dan payload sama, kembalikan response tersimpan.
6. Jika key sama tetapi payload berbeda, kembalikan `409 IDEMPOTENCY_KEY_REUSED`.

Jangan menyimpan secret atau data sensitif berlebihan dalam idempotency record. Tetapkan masa retensi yang cukup untuk retry client dan job.

---

## 11. QR token security

- Gunakan cryptographically secure random generator.
- Token cukup panjang untuk mencegah tebakan.
- Simpan hash token bila memungkinkan.
- Jangan encode nama, NIM, email, kelas, atau PII lain.
- Batasi scope dan masa berlaku.
- Validasi token di server untuk setiap aksi.
- Validasi hubungan token dengan booking/loan dan action yang diminta.
- Cegah replay setelah aksi selesai.
- Jangan mencatat token mentah ke application log.
- Gunakan rate limit pada endpoint validasi.
- Scan QR tidak mengubah transaksi; konfirmasi STAFF/ADMIN tetap wajib.

PRD menetapkan token yang sama untuk pickup dan return. Implementasi harus mempertahankan pengalaman token yang sama sambil memodelkan lifecycle pemakaiannya agar pickup yang sudah selesai tidak menghalangi return dan token tidak dapat dipakai untuk mengulang aksi yang sama. Jika detail ini memerlukan keputusan teknis tambahan, catat sebagai open decision dan sepakati sebelum membangun modul QR.

---

## 12. File storage dan upload

Jenis file:
- Foto identitas pendaftaran.
- Foto bukti return.

Persyaratan:
- Private bucket/container.
- Validasi MIME type berdasarkan isi file bila memungkinkan.
- Batasi ukuran file sesuai keputusan produk.
- Nama objek dibuat server-side, bukan mempercayai nama file client.
- Simpan storage key, bukan URL publik.
- Akses melalui signed URL singkat atau endpoint proxy terotorisasi.
- Cegah file upload menggantikan file milik pengguna lain.
- Terapkan otorisasi sebelum membuat signed URL.
- Hindari memasukkan file identitas ke log, email, atau response umum.
- Tentukan retensi dan prosedur penghapusan sesuai kebijakan privasi yang disepakati.

---

## 13. Email notification dan transactional outbox

### 13.1 Prinsip

- Email dikirim secara asynchronous.
- Pembuatan event outbox dilakukan dalam transaksi yang sama dengan perubahan bisnis.
- Worker mengirim email setelah transaksi commit.
- Kegagalan provider tidak boleh membatalkan booking, pickup, return, atau approval.
- Retry harus menggunakan deduplication key.
- Catat status dan error pengiriman tanpa menyimpan informasi sensitif yang tidak perlu.

### 13.2 Event minimum

- Verifikasi email.
- Pengajuan diterima.
- Pengajuan disetujui/ditolak.
- Pemberitahuan replacement kepada komting lama.
- Replacement selesai.
- Booking berhasil.
- Booking dibatalkan.
- Booking expired.
- Reminder pickup.
- Estimasi kembali terlewati/overdue.
- Return selesai.
- Pembatalan karena unit belum available pada tengah malam.
- Pembatalan karena maintenance.

Penerima email bisnis adalah komting yang relevan. Tidak perlu mengirim email operasional rutin ke STAFF/ADMIN berdasarkan PRD.

### 13.3 Retry

- Retry dengan exponential backoff atau kebijakan terukur.
- Batasi jumlah percobaan.
- Tandai event gagal permanen setelah batas percobaan.
- Sediakan observability untuk event yang gagal.
- Retry tidak boleh mengirim email duplikat bila provider mendukung idempotency atau dedupe key internal.

---

## 14. Scheduled jobs

Semua job harus:
- menggunakan `Asia/Jakarta` untuk batas kalender operasional,
- menyimpan waktu eksekusi dalam UTC,
- idempotent,
- memiliki log hasil,
- aman dijalankan ulang,
- memiliki mekanisme mencegah dua worker memproses pekerjaan yang sama secara bersamaan.

### 14.1 Midnight booking availability

Pada pukul 00:00 waktu Jakarta pada tanggal booking:
1. Ambil booking `CONFIRMED` untuk tanggal tersebut.
2. Kelompokkan/lock unit terkait.
3. Periksa status fisik aktual.
4. Jika unit tidak `AVAILABLE`, batalkan booking yang bergantung pada unit tersebut.
5. Buat outbox email kepada komting.
6. Catat audit/system event.
7. Pastikan retry tidak menggandakan pembatalan/email.

### 14.2 Booking expiry

- Expire booking yang tidak diambil setelah batas waktu `start_time + 15 menit`.
- Hanya booking `CONFIRMED` yang dapat diubah menjadi `EXPIRED`.
- Jangan mengubah booking yang sudah `FULFILLED`, `CANCELLED`, atau `EXPIRED`.
- Catat event dan email bila diwajibkan oleh kebijakan notifikasi.

### 14.3 Pickup reminder

- Jadwal pengiriman reminder perlu diputuskan.
- Hanya kirim untuk booking yang masih `CONFIRMED` dan relevan.
- Gunakan deduplication key per booking dan jenis reminder.

### 14.4 Overdue reminder

- Jika `estimated_return_at` terlewati dan loan masih `ACTIVE`, kirim email pengingat kepada komting.
- Jangan otomatis menutup loan.
- Jangan mengubah status fisik unit dari `BORROWED`.
- Deduplikasi reminder sesuai kebijakan yang disepakati.

### 14.5 Email outbox worker

- Ambil event pending secara aman.
- Tandai processing dengan lease/lock.
- Kirim melalui provider adapter.
- Tandai sent atau jadwalkan retry.
- Pulihkan event yang tertinggal pada status processing setelah worker crash.

---

## 15. Audit log dan observability

### 15.1 Audit log

Catat minimal:
- actor ID dan role,
- action,
- entity type dan ID,
- before/after untuk perubahan penting,
- reason untuk koreksi/deactivation/rejection,
- timestamp UTC,
- request ID,
- sumber aksi (API atau system job) bila relevan.

System job harus memiliki identitas aktor sistem yang jelas, bukan menyamar sebagai ADMIN.

### 15.2 Application logging

- Gunakan structured logs.
- Sertakan request ID/correlation ID.
- Jangan log password, access token, QR token mentah, foto, atau PII berlebihan.
- Redact data sensitif.
- Catat error database/provider dengan konteks aman.
- Pisahkan audit log bisnis dari application log teknis.

### 15.3 Monitoring

Pantau setidaknya:
- API error rate dan latency.
- Authentication/authorization failures.
- Booking conflicts.
- Job failures/lag.
- Email outbox backlog dan failed events.
- Upload failures.
- Database connection/transaction errors.

---

## 16. Security baseline

- Validasi semua input di server.
- Terapkan autentikasi dan role authorization pada setiap endpoint terlindungi.
- Batasi akses data berdasarkan ownership.
- Gunakan parameterized queries/ORM yang aman.
- Terapkan rate limit untuk login, pendaftaran, upload, QR validation, dan endpoint sensitif.
- Cegah mass assignment: hanya field allowlist yang dapat diubah.
- Cegah IDOR dengan memeriksa ownership dan permission.
- CORS dibatasi pada origin yang diperlukan.
- Gunakan HTTPS pada seluruh environment non-local.
- Simpan secret di secret manager/environment server-side.
- Jangan mengekspos service-role key ke frontend.
- Gunakan private storage untuk dokumen.
- Validasi file upload.
- Terapkan backup database dan uji prosedur restore.
- Jangan menghapus audit log melalui API.
- Jangan membocorkan stack trace atau query database ke client.

---

## 17. Testing backend

### 17.1 Unit tests

Uji business rules:
- Role dan status akun.
- Assignment aktif.
- Pengajuan replacement.
- Aturan hari ini/besok.
- Waktu lampau.
- Estimasi kembali pada tanggal yang sama.
- Jam operasional.
- Pickup window.
- Expiry.
- Return inspection.
- Maintenance disposition.
- Email deduplication.
- Idempotency behavior.

### 17.2 Integration tests

Uji:
- API authentication dan authorization.
- Database constraints.
- Ownership data KOMTING.
- Upload privat dan signed URL.
- Atomic booking.
- Atomic pickup.
- Atomic return.
- Replacement atomik.
- Deactivation dan pembatalan booking.
- Maintenance dan pembatalan booking terdampak.
- Transactional outbox.
- Scheduled jobs dan retry.

### 17.3 Concurrency tests

Wajib menguji:
1. Dua request booking bersamaan untuk unit/slot yang sama.
2. Dua request booking bersamaan dari komting yang sama.
3. Dua pickup bersamaan untuk booking yang sama.
4. Dua return bersamaan untuk loan yang sama.
5. Dua approval komting untuk kelas yang sama.
6. Job midnight berjalan dua kali.
7. Worker email memproses event yang sama bersamaan.

Hasil harus menjaga invariant dan tidak membuat transaksi ganda.

### 17.4 End-to-end business scenarios

1. Pendaftaran komting → ADMIN approve → assignment aktif.
2. Replacement ditolak → komting lama tetap aktif.
3. Replacement disetujui → assignment lama nonaktif dan baru aktif.
4. Komting membuat booking valid.
5. Booking besok dibatalkan jika unit belum available saat tengah malam.
6. Booking pickup sukses → loan aktif → unit borrowed.
7. Estimasi kembali terlewati → email reminder, loan tetap aktif.
8. Return normal → loan returned, unit available.
9. Return rusak → loan returned, unit maintenance.
10. Deactivation → booking belum pickup dibatalkan, loan aktif tetap berjalan.
11. Maintenance → booking terdampak dibatalkan dan email dikirim.
12. Pengguna tanpa izin menerima `403`.
13. Retry dengan idempotency key sama tidak menggandakan transaksi.

---

## 18. Urutan implementasi backend

Kerjakan bertahap dan integrasikan per domain.

### Sprint BE-0 — Fondasi
- Pilih dan setup stack final.
- Setup repository/project.
- Setup environment configuration.
- Setup database dan migration framework.
- Setup API versioning.
- Setup response/error wrapper.
- Setup request ID dan structured logging.
- Setup validation.
- Setup test framework.
- Buat `PROJECT_CONTEXT.md`.

### Sprint BE-1 — Identity dan authorization
- Integrasi provider auth.
- Profil aplikasi.
- `/me`.
- Role middleware/policies.
- Ownership checks.
- Account status enforcement.
- Tests untuk role dan akses data.

### Sprint BE-2 — Komting
- Application schema/API.
- Upload foto privat.
- Admin review.
- Approve/reject.
- Assignment constraints.
- Replacement.
- Deactivation.
- Audit dan outbox event.

### Sprint BE-3 — Inventory dan operating hours
- Projector CRUD sesuai role.
- Physical status.
- Operating hours.
- Snapshot.
- Availability query.
- Tests perubahan jam dan konflik.

### Sprint BE-4 — Booking
- Booking schema.
- Availability validation.
- Booking creation.
- Cancellation.
- Idempotency.
- Concurrency/locking tests.
- Midnight availability job.

### Sprint BE-5 — QR, pickup, dan loan
- QR token lifecycle.
- QR validation.
- Pickup confirmation.
- Loan creation.
- Booking/loan/projector atomic transition.
- Expiry job.
- Tests replay dan duplicate pickup.

### Sprint BE-6 — Return dan maintenance
- Return inspection.
- Evidence upload.
- Return transaction.
- Maintenance workflow.
- Projector disposition.
- Tests return normal/damaged/incomplete.

### Sprint BE-7 — Email, audit, dan hardening
- Transactional outbox worker.
- Email templates/provider adapter.
- Pickup reminder.
- Overdue reminder.
- Audit log endpoints.
- Admin corrections allowlist.
- Rate limiting/security tests.
- OpenAPI finalization.

### Sprint BE-8 — Integration readiness
- API contract conformance tests.
- Frontend integration support.
- End-to-end scenarios.
- Database backup/restore check.
- Deployment readiness.

---

## 19. Definition of Done backend

Backend dinyatakan siap untuk integrasi jika:
- [ ] Database migrations dapat dijalankan dari kondisi kosong.
- [ ] Constraints utama menjaga invariant bisnis.
- [ ] Endpoint mengikuti API Contract.
- [ ] OpenAPI diperbarui.
- [ ] Authentication dan authorization berjalan server-side.
- [ ] Ownership dan akses file privat diuji.
- [ ] Booking/pickup/return/replacement bersifat atomik.
- [ ] Idempotency diterapkan pada operasi kritis.
- [ ] Scheduled jobs idempotent dan tercatat.
- [ ] Email menggunakan transactional outbox.
- [ ] Audit log tersedia dan tidak dapat dihapus melalui API.
- [ ] Error code konsisten.
- [ ] Unit/integration/concurrency tests relevan lulus.
- [ ] Tidak ada secret di repository atau response.
- [ ] `PROJECT_CONTEXT.md` mencerminkan implementasi aktual.
- [ ] Known issues dan open decisions terdokumentasi.

---

## 20. Format laporan wajib dari Antigravity

Setelah setiap prompt/sprint, Antigravity wajib melaporkan:

1. Ringkasan hasil.
2. File yang dibuat.
3. File yang diubah.
4. Migration/schema yang ditambahkan.
5. Endpoint yang selesai dan status kesesuaiannya dengan API Contract.
6. Business rules yang telah diimplementasikan.
7. Tests yang dijalankan beserta hasil aktual.
8. Concurrency/security checks yang sudah/belum dilakukan.
9. Known issues dan open decisions.
10. Langkah berikutnya.
11. Konfirmasi bahwa `PROJECT_CONTEXT.md` diperbarui.

Jangan mengklaim test lulus bila tidak dijalankan. Jangan melakukan audit ulang seluruh repository setiap sprint. Baca `PROJECT_CONTEXT.md` dan laporan terakhir, lalu periksa perubahan yang relevan dengan tugas saat ini.

---

## 21. Open decisions sebelum/selama implementasi

Poin berikut harus disepakati, bukan ditebak:

1. Provider autentikasi final.
2. Framework/backend deployment final.
3. Detail field identitas mahasiswa.
4. Batas ukuran, MIME type, dan retensi foto.
5. Detail replacement response window jika ada.
6. Batas pembatalan booking oleh komting.
7. Detail pembukaan lebih awal dan perubahan jam tutup.
8. Jadwal pickup reminder dan overdue reminder.
9. Masa berlaku dan lifecycle QR token yang sama untuk pickup/return.
10. Daftar field yang boleh dikoreksi ADMIN.
11. Kebijakan rate limit.
12. Retensi audit log dan backup.
13. Apakah inbox notifikasi internal diperlukan.

Setiap open decision harus memiliki pemilik keputusan dan dicatat dalam project context. Jangan menghentikan seluruh implementasi jika keputusan tersebut tidak memengaruhi sprint berjalan; tandai dan lanjutkan bagian yang sudah jelas.

---

## 22. Definition of Done dokumen

Dokumen ini siap digunakan sebagai panduan backend ketika:
- [ ] Backend Lead menyetujui stack dan batas arsitektur.
- [ ] API Contract disepakati bersama Frontend Lead.
- [ ] Model data dan invariant ditinjau.
- [ ] Open decisions yang menghalangi Sprint BE-0/BE-1 ditutup.
- [ ] Sprint BE-0 dapat dimulai tanpa menunggu frontend selesai.
