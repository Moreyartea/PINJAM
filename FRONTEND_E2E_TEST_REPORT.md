# Laporan End-to-End Testing & Integrasi Frontend PINJAM (FE-15.0)

> Dokumen ini menyajikan hasil validasi menyeluruh alur pengguna (*end-to-end user flows*), integrasi antarhalaman, penegakan aturan bisnis, serta kesiapan integrasi frontend PINJAM dengan backend sebenarnya.

---

## 1. Lingkungan Pengujian & Konfigurasi Test

- **Framework Pengujian:** Vitest v5.1.2 + `@testing-library/react` + `@testing-library/user-event` + `jsdom`.
- **Lokasi Test Suite:** `src/e2e/` (dijalankan via script `npm run test:e2e`).
- **Mode Eksekusi:** Frontend Integration & Mock Service Isolation.
- **Status Backend Live (Port 3001):** **OFFLINE** (`TcpTestSucceeded: False`). Sesuai batasan proyek, backend dikerjakan oleh anggota tim lain pada *branch* terpisah. Pengujian dilakukan secara terisolasi tanpa mengubah atau mengganggu repositori/branch backend.
- **Pemisahan Validasi:**
  - **Terverifikasi (PASS):** Logika alur frontend, interaksi UI Neubrutalism, RoleGuard, penanganan error (400, 401, 403, 404, 409, 500), validasi client-side, dan pemanggilan kontrak service API.
  - **Belum Terverifikasi ke Live Backend (UNVERIFIED / BLOCKED):** Handshake jaringan langsung ke server backend port 3001 karena server belum aktif di lingkungan lokal ini.

---

## 2. Matriks Skenario & Hasil Pengujian E2E

Seluruh 5 suite pengujian (`src/e2e/*.test.tsx`) berhasil lulus 100% (**26 dari 26 skenario PASSED**).

| Kategori Skenario | Berkas Test | Total Test | Status | Keterangan Ringkas |
| :--- | :--- | :---: | :---: | :--- |
| **A. Role Access & Proteksi Antar-Role** | [`src/e2e/role-access.test.tsx`](file:///d:/Semester%203/Metode%20Numerik/PINJAMv2/src/e2e/role-access.test.tsx) | 5 | **PASS** | Mencegah akses silang peran (KOMTING ditolak dari STAFF/ADMIN; STAFF ditolak dari ADMIN), redirect unauthenticated ke `/login?next=...`, diferensiasi status sesi, dan jaminan otorisasi server. |
| **B. Alur KOMTING** | [`src/e2e/komting-flow.test.tsx`](file:///d:/Semester%203/Metode%20Numerik/PINJAMv2/src/e2e/komting-flow.test.tsx) | 4 | **PASS** | Alur login & redirect status akun, eksplorasi katalog proyektor, pembuatan booking baru, verifikasi kartu token QR, pembatalan booking berdasar aturan bisnis, dan riwayat peminjaman. |
| **C. Operasional STAFF** | [`src/e2e/staff-operations-flow.test.tsx`](file:///d:/Semester%203/Metode%20Numerik/PINJAMv2/src/e2e/staff-operations-flow.test.tsx) | 4 | **PASS** | Daftar & detail booking, validasi token QR manual/scanner tanpa mutasi langsung, konfirmasi pickup eksplisit (dengan nama perwakilan jika didelegasikan), inspeksi return & wajib foto jika rusak, serta pencatatan & penyelesaian maintenance. |
| **D. Tata Kelola ADMIN** | [`src/e2e/admin-flow.test.tsx`](file:///d:/Semester%203/Metode%20Numerik/PINJAMv2/src/e2e/admin-flow.test.tsx) | 7 | **PASS** | Dashboard metrik operasional, persetujuan/penolakan pengajuan komting dengan alasan wajib, CRUD inventaris proyektor terpisah dari status fisik, konfigurasi jam operasional Asia/Jakarta & konflik 409, audit log *read-only* dengan snapshot JSON, serta banner celah kontrak transparan. |
| **E. Validasi Aturan Bisnis** | [`src/e2e/business-rules.test.tsx`](file:///d:/Semester%203/Metode%20Numerik/PINJAMv2/src/e2e/business-rules.test.tsx) | 6 | **PASS** | Batasan tanggal (hari ini / besok), jam mulai sebelum estimasi kembali pada hari yang sama, penolakan pickup perwakilan tanpa nama, kewajiban unggah foto fisik saat DAMAGED/INCOMPLETE, dan integritas status fisik (tidak dapat diubah sepihak). |

---

## 3. Rincian Temuan & Perbaikan Selama Siklus Pengujian

Selama penulisan dan eksekusi pengujian integrasi E2E, ditemukan sejumlah ketidaksesuaian kecil antara asumsi pengujian awal dengan implementasi aktual komponen:

1. **Aturan Validasi Waktu Lampau pada Tanggal Hari Ini:**
   - *Masalah:* Saat pengujian dijalankan pada siang hari (WIB), default waktu mulai booking `09:00` otomatis ditolak oleh validasi sisi klien karena berada di masa lalu untuk tanggal hari ini.
   - *Solusi:* Skenario pengujian booking diperbarui untuk memilih tanggal besok (`tomorrow = getJakartaTomorrowDateString()`) sehingga pengujian deterministik sepanjang waktu tanpa memicu validasi jam lampau.
2. **Pencocokan Label dan Teks Status (Lokalisasi Bahasa Indonesia):**
   - *Masalah:* Komponen `StatusBadge` mengonversi nilai enum status menjadi teks bahasa Indonesia (misal `CONFIRMED` menjadi "Terkonfirmasi", `AVAILABLE` menjadi "Tersedia", `IN_PROGRESS` menjadi "Dalam Perbaikan", `PENDING_VERIFICATION` menjadi "Menunggu Verifikasi").
   - *Solusi:* Selector query pada test disesuaikan dengan teks UI yang dirender oleh `StatusBadge`.
3. **Penamaan Tombol & Modal Dialog Konfirmasi:**
   - *Masalah:* Dialog konfirmasi modal menggunakan label spesifik (misal tombol kirim booking bernama `"Kirim Booking"`, modal pickup berjudul `"Konfirmasi Penyerahan Proyektor?"` dengan tombol `"Ya, Konfirmasi Pickup"`, modal return berjudul `"Konfirmasi Pengembalian Unit?"` dengan tombol `"Ya, Selesaikan Return"`, dan modal admin proyektor berjudul `"Simpan Proyektor Baru?"` dengan tombol `"Ya, Simpan Unit"`).
   - *Solusi:* Seluruh pemanggilan aksi modal diselaraskan dengan teks aktual `ConfirmDialog` di setiap komponen fitur.
4. **Asynchronous Query Timing pada Pengambilan Token QR:**
   - *Masalah:* Komponen `BookingDetailView` mengambil token QR secara asinkron terpisah via `useAsyncQuery`. Penggunaan `getByText` sinkron menyebabkan pengujian gagal sebelum promise terselesaikan.
   - *Solusi:* Diganti dengan `await screen.findByText(...)` yang menunggu resolusi query secara elegan.

---

## 4. Evaluasi Kesiapan Integrasi Backend (*Live Integration Readiness*)

### A. Endpoint & Operasi yang Telah Terpetakan Sesuai Kontrak
1. **Autentikasi & Sesi:** Menggunakan Supabase Auth dengan adapter yang mengelola token Bearer pada header `Authorization`, penanganan token kedaluwarsa, dan *refresh token*.
2. **Katalog & Ketersediaan Proyektor:** `GET /api/v1/projectors`, `GET /api/v1/projectors/{id}`, `GET /api/v1/availability` terintegrasi dengan penanganan status fisik terpisah dari `is_active`.
3. **Jam Operasional:** `GET /api/v1/operating-hours` dan `PUT /api/v1/admin/operating-hours/{date}` dengan pengelolaan zona waktu Asia/Jakarta dan toleransi pickup.
4. **Siklus Booking KOMTING:** `POST /api/v1/bookings` (dengan `Idempotency-Key`), `GET /api/v1/bookings`, `GET /api/v1/bookings/{id}`, `POST /api/v1/bookings/{id}/cancel`.
5. **Operasional QR & Serah Terima STAFF:** `POST /api/v1/qr/validate` (hanya pembacaan konteks, tanpa mutasi database), `POST /api/v1/bookings/{id}/pickup` (dengan validasi eksplisit nama perwakilan), `POST /api/v1/loans/{id}/return` (dengan multipart FormData untuk foto bukti saat DAMAGED/INCOMPLETE).
6. **Maintenance:** `GET /api/v1/maintenance`, `POST /api/v1/maintenance`, `POST /api/v1/maintenance/{id}/complete`.
7. **Verifikasi Pengajuan Komting:** `GET /api/v1/admin/applications`, `POST /api/v1/admin/applications/{id}/approve`, `POST /api/v1/admin/applications/{id}/reject`, `POST /api/v1/admin/applications/{id}/approve-replacement`.
8. **Audit Log:** `GET /api/v1/admin/audit-logs`, `GET /api/v1/admin/audit-logs/{id}` (bersifat *read-only* murni tanpa tombol manipulasi).

### B. Transparansi Keterbatasan & Celah Kontrak (*Contract Gaps*)
1. **Admin Staff Management:** Kontrak backend belum menyediakan endpoint manajemen CRUD akun staf (`/api/v1/admin/staff`). Frontend menampilkan peringatan celah kontrak yang transparan dan menonaktifkan fitur simulasi saat terhubung ke backend live.
2. **Assignment Management:** Kontrak backend belum menyediakan endpoint CRUD penugasan kelas (`/api/v1/admin/assignments`). Penugasan komting dikelola secara atomik melalui persetujuan pengajuan (`approve` / `approve-replacement`).

---

## 5. Kesimpulan & Rekomendasi Langkah Berikutnya

Frontend PINJAM pada branch `feat/frontend-fe4-admin` telah siap secara arsitektural dan fungsional untuk disambungkan dengan backend sebenarnya:
- Tidak ada manipulasi status database yang dilakukan secara sepihak oleh frontend.
- Seluruh mutasi kritis dilindungi dengan header `Idempotency-Key` untuk mencegah *double-submit*.
- Proteksi otorisasi bertingkat ditegakkan melalui `RoleGuard` di sisi klien dan penanganan error respons 401/403 dari server.
- Siap untuk dilakukan *backend pairing* dan pengujian jaringan terpadu saat branch backend digabungkan ke lingkungan staging.
